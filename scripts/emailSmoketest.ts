#!/usr/bin/env tsx
/**
 * Resend deliverability smoketest.
 *
 * Run after rotating RESEND_API_KEY or changing DNS to confirm:
 *   1. The API key is accepted (no 401).
 *   2. The sender domain is registered and DNS records (SPF / DKIM / DMARC)
 *      are verified.
 *   3. EMAIL_FROM points to a domain Resend recognizes.
 *
 * Usage:
 *   npm run email:smoketest
 *   npm run email:smoketest -- --send-test=you@example.com
 *
 * The optional --send-test flag fires a real transactional email so you can
 * confirm end-to-end delivery (inbox + From header + unsubscribe). Skipped by
 * default to avoid burning Resend quota during routine checks.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

type Status = "PASS" | "WARN" | "FAIL";
type Check = { status: Status; label: string; detail?: string };

const checks: Check[] = [];

function record(status: Status, label: string, detail?: string): void {
  checks.push({ status, label, detail });
}

function logCheck({ status, label, detail }: Check): void {
  const tag = status === "PASS" ? "[PASS]" : status === "WARN" ? "[WARN]" : "[FAIL]";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${tag} ${label}${suffix}`);
}

function parseArgs(): { sendTestTo: string | null } {
  const out: { sendTestTo: string | null } = { sendTestTo: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--send-test=")) {
      out.sendTestTo = arg.slice("--send-test=".length).trim() || null;
    }
  }
  return out;
}

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  region?: string;
  created_at?: string;
  records?: Array<{
    record: string;
    name: string;
    type: string;
    status: string;
    value?: string;
  }>;
}

interface ResendDomainListResponse {
  data?: ResendDomain[];
}

interface ResendErrorResponse {
  message?: string;
  name?: string;
  statusCode?: number;
}

interface ResendSendResponse {
  id?: string;
  message?: string;
}

/**
 * Pull out just the domain part of an EMAIL_FROM value such as
 * "go-daily <hello@go-daily.app>" → "go-daily.app".
 */
function extractDomain(emailFrom: string): string | null {
  const angle = emailFrom.match(/<([^>]+)>/);
  const address = (angle ? angle[1] : emailFrom).trim();
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain || null;
}

async function fetchDomains(apiKey: string): Promise<ResendDomain[]> {
  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 401) {
    record("FAIL", "Resend API key", "401 Unauthorized — rotate the key in Resend Dashboard");
    return [];
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ResendErrorResponse | null;
    record(
      "FAIL",
      "Resend domains API",
      `HTTP ${response.status} — ${body?.message ?? body?.name ?? "unknown"}`,
    );
    return [];
  }

  record("PASS", "Resend API key accepted");

  const body = (await response.json()) as ResendDomainListResponse;
  return body.data ?? [];
}

async function fetchDomainDetail(apiKey: string, domainId: string): Promise<ResendDomain | null> {
  const response = await fetch(`https://api.resend.com/domains/${domainId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as ResendDomain;
}

function summarizeDomainRecords(domain: ResendDomain): void {
  const records = domain.records ?? [];
  if (records.length === 0) {
    record(
      "WARN",
      `${domain.name} DNS records`,
      "Resend returned no record list — open the domain in Dashboard to verify",
    );
    return;
  }

  // Group by record-type-of-interest. Resend's `record` field is one of
  // SPF / DKIM / MX / DMARC; status is "verified" when the lookup succeeds.
  const interesting = ["SPF", "DKIM", "MX", "DMARC"];
  for (const recordType of interesting) {
    const matches = records.filter((r) => r.record === recordType);
    if (matches.length === 0) {
      // Surfacing a missing SPF/DKIM as WARN (not FAIL) on purpose: Resend's
      // per-domain detail endpoint occasionally omits records it has already
      // verified, and DMARC isn't strictly required for delivery.
      record("WARN", `${domain.name} ${recordType}`, "No record returned by Resend");
      continue;
    }
    const allVerified = matches.every((r) => r.status === "verified");
    if (allVerified) {
      record("PASS", `${domain.name} ${recordType}`, `${matches.length} record(s) verified`);
    } else {
      const failing = matches.filter((r) => r.status !== "verified").map((r) => r.status);
      record(
        "FAIL",
        `${domain.name} ${recordType}`,
        `Not verified — Resend status: ${failing.join(", ")}`,
      );
    }
  }
}

async function maybeSendTest(apiKey: string, to: string, fromHeader: string): Promise<void> {
  console.log(`\nSending live test email to ${to} ...`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      subject: "go-daily smoketest",
      text: "If you can read this, the Resend pipeline is healthy.",
      html: '<p style="font-family:sans-serif">If you can read this, the Resend pipeline is healthy.</p>',
    }),
  });

  const body = (await response.json().catch(() => null)) as ResendSendResponse | null;

  if (!response.ok) {
    record("FAIL", "Live send", `HTTP ${response.status} — ${body?.message ?? "unknown"}`);
    return;
  }

  record("PASS", "Live send", `message id: ${body?.id ?? "(none returned)"}`);
}

async function main(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();

  if (!apiKey) {
    record("FAIL", "RESEND_API_KEY", "Not set in .env.local");
  }
  if (!emailFrom) {
    record("FAIL", "EMAIL_FROM", "Not set in .env.local");
  }

  if (!apiKey || !emailFrom) {
    finish();
    return;
  }

  const senderDomain = extractDomain(emailFrom);
  if (!senderDomain) {
    record("FAIL", "EMAIL_FROM format", `Could not extract a domain from "${emailFrom}"`);
    finish();
    return;
  }
  record("PASS", "EMAIL_FROM format", `sender domain: ${senderDomain}`);

  const domains = await fetchDomains(apiKey);
  if (domains.length === 0) {
    // fetchDomains already pushed a FAIL/WARN if the call failed; if it
    // succeeded but the list is empty, surface that distinctly.
    if (!checks.some((c) => c.status === "FAIL")) {
      record("FAIL", "Resend domains", "No domains registered on this account");
    }
    finish();
    return;
  }

  record("PASS", "Resend domains", `${domains.length} domain(s) registered`);

  const matched = domains.find((d) => d.name.toLowerCase() === senderDomain);
  if (!matched) {
    const known = domains.map((d) => d.name).join(", ");
    record(
      "FAIL",
      "Sender domain registration",
      `EMAIL_FROM uses ${senderDomain} but Resend knows: ${known}`,
    );
    finish();
    return;
  }

  if (matched.status !== "verified") {
    record(
      "FAIL",
      `${matched.name} status`,
      `Resend reports "${matched.status}" — finish DNS verification before sending`,
    );
  } else {
    record("PASS", `${matched.name} status`, "verified");
  }

  // Pull per-record breakdown so SPF / DKIM / DMARC each get their own line.
  const detail = await fetchDomainDetail(apiKey, matched.id);
  if (detail) summarizeDomainRecords(detail);

  const args = parseArgs();
  if (args.sendTestTo) {
    await maybeSendTest(apiKey, args.sendTestTo, emailFrom);
  } else {
    record("WARN", "Live send", "Skipped — pass --send-test=<address> to fire a real email");
  }

  finish();
}

function finish(): void {
  for (const check of checks) logCheck(check);
  const pass = checks.filter((c) => c.status === "PASS").length;
  const warn = checks.filter((c) => c.status === "WARN").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  console.log(`\nSummary: ${pass} pass, ${warn} warn, ${fail} fail`);
  console.log(`Result: ${fail === 0 ? "READY" : "NOT READY"}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[email:smoketest] crashed", err);
  process.exit(2);
});

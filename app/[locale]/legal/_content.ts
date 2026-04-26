import type { Locale } from "@/types";

export type LegalKind = "privacy" | "terms" | "refund";

type LegalSection = {
  summary?: string;
  heading: string;
  body: string;
};

type LegalCopy = {
  eyebrow: string;
  title: string;
  description: string;
  versionLabel: string;
  versionValue: string;
  sections: LegalSection[];
};

export const LEGAL_PATHS: Record<LegalKind, string> = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  refund: "/legal/refund",
};

const copy: Record<Locale, Record<LegalKind, LegalCopy>> = {
  en: {
    privacy: {
      eyebrow: "Our Commitment",
      title: "Privacy and Security",
      description:
        "We believe privacy is a fundamental human right. Our commitment to your security is built into every move you make on the grid.",
      versionLabel: "Legal Edition",
      versionValue: "2026",
      sections: [
        {
          heading: "Transparency by Design",
          summary:
            "We only collect the data necessary to provide a superior Go coaching experience.",
          body: "Your progress is synchronized using industry-standard encryption. We process essential identifiers and logs to optimize the Spaced Repetition System (SRS). We adhere to the global principles of GDPR (Europe), PIPA (South Korea), and PDPO (Hong Kong), providing you with a unified right to data portability and erasure.",
        },
        {
          heading: "Artificial Intelligence Ethics",
          summary:
            "Your interactions with our AI Coach are private, secure, and grounded in professional Go expertise.",
          body: "Dialogue history is processed via DeepSeek API with mandatory PII masking. In compliance with the EU AI Act 2026, we ensure all AI interactions are clearly labeled and used exclusively for your personal training, never for public model retraining.",
        },
      ],
    },
    terms: {
      eyebrow: "The Agreement",
      title: "Terms of Service",
      description:
        "Professional standards for our digital training environment and global Go community.",
      versionLabel: "Legal Edition",
      versionValue: "2026",
      sections: [
        {
          heading: "Provider Identity & Regional Compliance",
          summary: "Transparency about who we are and our legal presence in international markets.",
          body: "go-daily is provided by Frank. In compliance with the Japanese Act on Specified Commercial Transactions. For users in Taiwan, immediate access to digital training implies a waiver of the 7-day cooling-off period under Article 19 of the CPA.",
        },
        {
          heading: "Subscription Integrity",
          summary: "Stripe-powered billing with clarity at every step.",
          body: "In compliance with the UK DMCCA 2024, we provide transparent renewal notices for all Pro plans. Subscriptions auto-renew but can be cancelled at any time through a simple online process. We do not use 'dark patterns' to hinder your exit.",
        },
        {
          heading: "Liability & Governance",
          summary: "Protecting the sustainability of our Go sanctuary.",
          body: "This agreement is governed by the laws of the United States. Disputes are resolved through individual arbitration, preserving our focus on training while respecting mandatory local consumer guarantees in jurisdictions like Australia (ACL).",
        },
      ],
    },
    refund: {
      eyebrow: "Commercial Terms",
      title: "Refund and Cancellation",
      description: "Clear expectations for our premium digital experiences and coaching services.",
      versionLabel: "Legal Edition",
      versionValue: "2026",
      sections: [
        {
          heading: "Digital Performance Rule",
          summary: "Performance begins immediately upon activation of Pro features.",
          body: "Due to the immediate provision of AI coaching and puzzle access, all sales are considered final under international digital goods standards. You consent to the immediate performance of the contract upon checkout.",
        },
        {
          heading: "Statutory Protections",
          summary: "We respect your local consumer rights across all global markets.",
          body: "UK and EU residents retain a 14-day cancellation window after major renewals (UK DMCCA 2024). In Australia, our services come with statutory guarantees under the ACL that cannot be excluded; if the service fails an essential quality standard, you are entitled to a full remedy.",
        },
      ],
    },
  },
  zh: {
    privacy: {
      eyebrow: "核心准则",
      title: "隐私与安全",
      description: "我们深信隐私是一项基本人权。我们对您安全的承诺，融入了您在棋盘上的每一次落子。",
      versionLabel: "法律框架",
      versionValue: "2026 版",
      sections: [
        {
          heading: "透明化设计",
          summary: "我们仅收集为您提供卓越围棋教学体验所必需的数据。",
          body: "您的练习进度通过行业标准加密技术同步。我们处理必要的标识符以优化间隔复习系统 (SRS)。我们遵循 GDPR (欧洲)、PIPA (韩国) 和 PDPO (香港) 的全球原则，为您提供统一的数据迁移权和删除权。",
        },
        {
          heading: "人工智能伦理",
          summary: "您与 AI 教练的交互是私密、安全且基于专业围棋知识的。",
          body: "对话历史通过脱敏处理后发送至 DeepSeek API。遵循欧盟《人工智能法案 2026》，我们确保所有 AI 交互均经过清晰标识，且仅用于您的个人训练，绝不用于公开模型再训练。",
        },
      ],
    },
    terms: {
      eyebrow: "服务协议",
      title: "服务条款",
      description: "针对全球围棋社区和数字训练环境的专业标准。",
      versionLabel: "法律框架",
      versionValue: "2026 版",
      sections: [
        {
          heading: "提供方身份与地区合规",
          summary: "关于我们身份以及在国际市场法律存在的透明说明。",
          body: "go-daily 由开发者 Frank 提供。遵循日本《特定商取引法》。对于台湾用户，即时访问数字训练内容意味着放弃《消保法》第 19 条规定的 7 日鉴赏期。",
        },
        {
          heading: "订阅诚信",
          summary: "基于 Stripe 的清晰计费流程。",
          body: "遵循英国 DMCCA 2024，我们为所有 Pro 计划提供透明的续费提醒。订阅自动续费，但可随时通过简单的在线流程取消。我们严禁使用“暗黑模式”阻碍您的退出。",
        },
        {
          heading: "治理与责任",
          summary: "保护我们的围棋静室的可持续运营。",
          body: "本协议受美国法律管辖。争议通过个人仲裁解决，在尊重澳大利亚 (ACL) 等管辖区强制性消费者保障的同时，保持对教学使命的专注。",
        },
      ],
    },
    refund: {
      eyebrow: "商业条款",
      title: "退款与取消",
      description: "对高级数字体验和教练服务的清晰预期。",
      versionLabel: "法律框架",
      versionValue: "2026 版",
      sections: [
        {
          heading: "数字履约规则",
          summary: "履约自您的 Pro 功能激活那一刻起即开始。",
          body: "鉴于 AI 教练和题库的即时访问权限，所有销售通常视为最终交易。此标准符合国际数字商品准则。您在结账时即同意合同的立即履行。",
        },
        {
          heading: "法定保护",
          summary: "我们尊重全球所有市场的本地消费者权利。",
          body: "英国和欧盟居民在重大续费后保留 14 天的取消窗口 (UK DMCCA 2024)。在澳大利亚，若服务未能达到核心质量标准，根据 ACL 的法定担保，您享有获得补偿的权利。",
        },
      ],
    },
  },
  ja: {
    privacy: {
      eyebrow: "私たちの原則",
      title: "プライバシーとセキュリティ",
      description:
        "私たちは、プライバシーは基本的な人権であると信じています。セキュリティへの取り組みは、あなたのすべての着手に組み込まれています。",
      versionLabel: "法的枠組み",
      versionValue: "2026年版",
      sections: [
        {
          heading: "設計による透明性",
          summary: "最高の囲碁コーチング体験を提供するために必要なデータのみを収集します。",
          body: "学習データは業界標準の暗号化を使用して同期されます。SRS（間隔反復システム）を最適化するために必要な識別子を処理します。GDPR (欧州)、PIPA (韓国)、香港 PDPO などのグローバルな原則を遵守し、データのポータビリティと削除に関する権利を提供します。",
        },
        {
          heading: "人工知能の倫理",
          summary:
            "AI コーチとの対話はプライベートで安全であり、専門的な囲碁知識に基づいています。",
          body: "対話履歴は PII 脱敏処理の上、DeepSeek API で処理されます。欧州 AI 法 (2026) を遵守し、すべての AI インタラクションが明確に識別され、お客様の個人トレーニングのみに使用されることを保証します。",
        },
      ],
    },
    terms: {
      eyebrow: "合意事項",
      title: "利用規約",
      description: "グローバルな囲碁コミュニティとデジタル訓練環境のための専門的な基準。",
      versionLabel: "法的枠組み",
      versionValue: "2026年版",
      sections: [
        {
          heading: "提供者の識別と地域別の遵守事項",
          summary: "提供者の身元および国際市場における法的プレゼンスに関する透明性。",
          body: "go-daily は Frank によって提供されます。日本の特定商取引法を遵守しています。台湾のユーザーについては、デジタルコンテンツへの即時アクセスは消費者保護法に基づく 7 日間の鑑賞期の放棄を意味します。",
        },
        {
          heading: "購読の誠実性",
          summary: "Stripe による透明性の高い請求プロセス。",
          body: "英国 DMCCA 2024 に準拠し、すべての Pro プランで透明な更新通知を提供します。購読は自動更新されますが、オンライン手続きでいつでも解約可能です。解約を妨げるような「ダークパターン」は使用しません。",
        },
        {
          heading: "統治と責任",
          summary: "サービスの持続可能性を保護するための有限責任。",
          body: "本契約は米国法に準拠します。紛争は個別の仲裁によって解決され、オーストラリア (ACL) 等の強制的な消費者保護法を尊重しつつ、教育的使命への集中を維持します。",
        },
      ],
    },
    refund: {
      eyebrow: "商業条件",
      title: "返金とキャンセル",
      description: "プレミアムなデジタル体験とコーチングサービスに関する明確な指針。",
      versionLabel: "法的枠組み",
      versionValue: "2026年版",
      sections: [
        {
          heading: "デジタルコンテンツの性質",
          summary: "履行は、Pro 機能が有効化された瞬間に開始されます。",
          body: "AI コーチおよび問題アーカイブへの即時アクセス提供により、すべての販売は原則として確定的なものとなります。この基準は国際的なデジタル商品指令に準拠しており、決済時に履行開始に同意したものとみなされます。",
        },
        {
          heading: "法的な保護",
          summary: "私たちは、グローバル市場における現地の消費者権利を尊重します。",
          body: "英国および欧州の居住者は、主要な更新後 14 日間のキャンセル期間を保持します (UK DMCCA 2024)。オーストラリアでは、サービスが核心的な品質基準を満たさない場合、ACL に基づく法定保証により救済を受ける権利があります。",
        },
      ],
    },
  },
  ko: {
    privacy: {
      eyebrow: "우리의 원칙",
      title: "개인정보 보호 및 보안",
      description:
        "우리는 프라이버시가 기본적인 인권이라고 믿습니다. 보안에 대한 우리의 약속은 여러분의 모든 수 읽기에 녹아 있습니다.",
      versionLabel: "법적 체계",
      versionValue: "2026년판",
      sections: [
        {
          heading: "설계에 의한 투명성",
          summary: "최고의 바둑 코칭 경험을 제공하기 위해 필수적인 데이터만을 수집합니다.",
          body: "학습 기록은 업계 표준 암호화를 사용하여 동기화됩니다. SRS(간격 반복 시스템) 최적화를 위한 식별자를 처리합니다. GDPR(유럽), PIPA(한국), 홍콩 PDPO의 글로벌 원칙을 준수하며, 데이터 이식성 및 삭제 권리를 보장합니다.",
        },
        {
          heading: "인공지능 윤리",
          summary: "AI 코치와의 상호작용은 비공개이며 안전하고 전문적인 바둑 지식에 기반합니다.",
          body: "대화 내역은 PII 마스킹 처리 후 DeepSeek API를 통해 처리됩니다. 유럽 AI 법(2026)에 따라 모든 AI 상호작용을 명확히 식별하며, 비공개 대화는 공개 모델 학습에 사용되지 않음을 보장합니다.",
        },
      ],
    },
    terms: {
      eyebrow: "합의 사항",
      title: "서비스 이용약관",
      description: "글로벌 바둑 커뮤니티와 디지털 훈련 환경을 위한 전문적인 표준.",
      versionLabel: "법적 체계",
      versionValue: "2026년판",
      sections: [
        {
          heading: "제공자 신원 및 지역별 준수",
          summary: "제공자 신원 및 국제 시장에서의 법적 존재감에 대한 투명한 공개.",
          body: "go-daily는 Frank에 의해 제공됩니다. 일본 특정상거래법을 준수합니다. 대만 사용자의 경우, 디지털 콘텐츠 즉시 이용은 소비자 보호법에 따른 7일 청약철회 기간의 포기를 의미합니다.",
        },
        {
          heading: "구독의 무결성",
          summary: "Stripe를 통한 투명한 결제 프로세스.",
          body: "영국 DMCCA 2024를 준수하여 모든 Pro 플랜에 대해 투명한 갱신 알림을 제공합니다. 구독은 자동 갱신되나 언제든지 온라인으로 간편하게 해지할 수 있으며, 해지를 방해하는 '다크 패턴'을 사용하지 않습니다.",
        },
        {
          heading: "거버넌스 및 책임",
          summary: "서비스의 지속 가능성을 보호하기 위한 제한적 책임.",
          body: "본 약관은 미국법의 관할을 받습니다. 모든 분쟁은 개별 중재를 통해 해결되며, 호주(ACL)와 같은 관할권의 강제적 소비자 보호법을 존중하면서 교육적 사명에 집중합니다.",
        },
      ],
    },
    refund: {
      eyebrow: "상거래 조건",
      title: "환불 및 취소",
      description: "프리미엄 디지털 경험 및 코칭 서비스에 대한 명확한 기준.",
      versionLabel: "법적 체계",
      versionValue: "2026년판",
      sections: [
        {
          heading: "디지털 콘텐츠의 특성",
          summary: "서비스 이행은 Pro 기능이 활성화되는 즉시 시작됩니다.",
          body: "AI 코칭 엔진 및 문제 아카이브에 대한 즉각적인 접근 제공으로 인해 모든 결제는 원칙적으로 환불이 불가능합니다. 이 기준은 국제 디지털 상품 지침을 따르며, 결제 시 이행 시작에 동의한 것으로 간주됩니다.",
        },
        {
          heading: "법적 보호",
          summary: "우리는 모든 글로벌 시장의 현지 소비자 권리를 존중합니다.",
          body: "영국 및 유럽 거주자는 주요 갱신 후 14일의 취소 기간을 가집니다(UK DMCCA 2024). 호주에서는 서비스가 핵심 품질 기준을 충족하지 못할 경우 ACL의 법적 보증에 따라 구제받을 권리가 있습니다.",
        },
      ],
    },
  },
};

export function getLegalCopy(locale: Locale, kind: LegalKind): LegalCopy {
  return copy[locale]?.[kind] ?? copy.en[kind];
}

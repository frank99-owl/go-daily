import type { Locale } from "@/types";

export type LegalKind = "privacy" | "terms" | "refund" | "tokushoho";

type LegalCopy = {
  eyebrow: string;
  title: string;
  description: string;
  updatedLabel: string;
  updatedValue: string;
  status: string;
  sections: Array<{
    heading: string;
    body: string;
  }>;
};

export const LEGAL_PATHS: Record<LegalKind, string> = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  refund: "/legal/refund",
  tokushoho: "/legal/tokushoho",
};

const copy: Record<Locale, Record<LegalKind, LegalCopy>> = {
  en: {
    privacy: {
      eyebrow: "Global Privacy Framework",
      title: "Privacy Policy",
      description:
        "Comprehensive data protection across US, UK, EU, AU, CA, HK, and KR jurisdictions.",
      updatedLabel: "Last updated",
      updatedValue: "April 26, 2026",
      status: "Global Compliance v2.5",
      sections: [
        {
          heading: "1. International Data Transfers (Global)",
          body: "go-daily utilizes a globally distributed infrastructure. User data is primary processed in Singapore (Supabase) and the United States (Vercel). We comply with cross-border data transfer mechanisms such as the EU/UK Standard Contractual Clauses (SCCs), Hong Kong's PDPO best practices, and Canada's CPPA accountability principles.",
        },
        {
          heading: "2. Jurisdiction-Specific Disclosures",
          body: "• Hong Kong: Data is handled according to the Personal Data (Privacy) Ordinance. • Canada: We assume ultimate accountability for your data under CPPA/PIPEDA. • South Korea: You explicitly consent to overseas data transfer to Singapore/USA by using our /[ko] localized service.",
        },
        {
          heading: "3. AI Interaction Security",
          body: "Coach dialogues are transmitted to DeepSeek API with PII masking. No private dialogues are used for public model training. For EU residents, this processing is performed under the 'Performance of a Contract' legal basis.",
        },
        {
          heading: "4. Data Subject Rights",
          body: "You have the right to access, rectify, or delete your data. UK residents may also exercise their rights under the UK GDPR. Australia residents have rights under the Privacy Act 1988.",
        },
      ],
    },
    terms: {
      eyebrow: "Service Agreement",
      title: "Terms of Service",
      description: "Legal standards for global Go training and AI coaching.",
      updatedLabel: "Last updated",
      updatedValue: "April 26, 2026",
      status: "Global Compliance v2.5",
      sections: [
        {
          heading: "1. Acceptance & Regional Exceptions",
          body: "By using go-daily, you agree to these terms. For users in Taiwan: You expressly acknowledge that our digital Go training service is a 'non-tangible digital content' provided immediately upon subscription, and you consent to waive the 7-day cooling-off period under Article 19 of the Consumer Protection Act.",
        },
        {
          heading: "2. Subscription Renewal (UK/Global)",
          body: "Subscriptions auto-renew unless cancelled. In compliance with the UK DMCCA 2024, we will provide reminder notices before trial endings and major annual renewals. Cancellation is available via a single-journey online process.",
        },
        {
          heading: "3. Disclaimers & AI Heuristics",
          body: "The AI Coach provides heuristics based on professional solution notes. Under the Australian Consumer Law (ACL), our services come with statutory guarantees that cannot be excluded; however, we do not guarantee specific tournament ranks or professional outcomes.",
        },
        {
          heading: "4. Governing Law & Arbitration",
          body: "This agreement is governed by the laws of the United States. Disputes are resolved via individual binding arbitration, waiving class-action rights, except where prohibited by local consumer laws (e.g., EU/Australia mandatory local jurisdiction).",
        },
      ],
    },
    refund: {
      eyebrow: "Commercial Standards",
      title: "Refund Policy",
      description: "Global refund and cancellation standards for digital goods.",
      updatedLabel: "Last updated",
      updatedValue: "April 26, 2026",
      status: "Global Compliance v2.5",
      sections: [
        {
          heading: "1. Digital Performance (Standard)",
          body: "Upon subscription activation, the digital performance begins immediately. Sales are generally non-refundable once access to the AI Coach and Puzzle Archive is granted.",
        },
        {
          heading: "2. Statutory Cooling-Off Periods (UK/EU)",
          body: "Residents of the UK and EU have a 14-day right to cancel after a trial ends or after an annual renewal, as mandated by DMCCA 2024 and EU Directive 2011/83/EU. Refund requests within this period will be processed pro-rata where applicable.",
        },
        {
          heading: "3. Australian Consumer Law (ACL) Guarantees",
          body: "In Australia, if our digital service fails a consumer guarantee (e.g., persistent technical failure preventing use), you are entitled to a remedy, which may include a full refund, regardless of our standard 'no refund' policy.",
        },
        {
          heading: "4. Cancellation & Access",
          body: "Cancellation stops future billing. Access remains active until the current billing cycle expires. No partial refunds for unused portions of a monthly cycle, subject to local statutory exceptions.",
        },
      ],
    },
    tokushoho: {
      eyebrow: "日本国内法規",
      title: "Specified Commercial Transactions Act (Japan)",
      description: "Required statutory disclosure for the Japanese market.",
      updatedLabel: "Last updated",
      updatedValue: "April 26, 2026",
      status: "Statutory Disclosure",
      sections: [
        {
          heading: "Seller Identity (販売業者)",
          body: "Legal Name: [Your Legal Name/Entity] (Available upon request for individual developers to protect privacy).",
        },
        {
          heading: "Director (運営統括責任者)",
          body: "Frank.",
        },
        {
          heading: "Address & Contact (所在地・連絡先)",
          body: "Address: [Physical Address]. Contact: support@go-daily.app. Phone provided upon request for compliance.",
        },
        {
          heading: "Commercial Terms (価格・支払)",
          body: "Price: As indicated on the pricing page. JCT: Calculated via Stripe Tax. Payment: Credit Cards via Stripe.",
        },
      ],
    },
  },
  zh: {
    privacy: {
      eyebrow: "全球隐私框架",
      title: "隐私政策",
      description: "涵盖美国、英国、欧盟、澳新、加拿大及港台地区的全面数据保护。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 26 日",
      status: "全球合规版 v2.5",
      sections: [
        {
          heading: "1. 国际数据传输 (全球)",
          body: "go-daily 利用全球分布的基础设施。用户数据主要在新加坡 (Supabase) 和美国 (Vercel) 处理。我们遵守跨境数据传输机制，包括欧盟/英国标准合同条款 (SCCs)、香港 PDPO 最佳实践以及加拿大 CPPA 问责原则。",
        },
        {
          heading: "2. 特定管辖区披露",
          body: "• 香港：数据处理遵守《个人资料（隐私）条例》。• 台湾：遵守《个人资料保护法》(PDPA)。• 加拿大：根据 CPPA/PIPEDA 对您的数据承担最终问责制。• 韩国：使用本地化服务即表示明确同意数据传输至新加坡/美国。",
        },
        {
          heading: "3. AI 交互安全",
          body: "教练对话在脱敏后通过 DeepSeek API 处理。私密对话不会用于公开模型训练。对于欧盟居民，此类处理基于“履行合同”的法律依据。",
        },
        {
          heading: "4. 数据主体权利",
          body: "您拥有访问、更正或删除数据的权利。英国居民可根据 UK GDPR 行使权利。澳大利亚居民享有 1988 年隐私法规定的权利。",
        },
      ],
    },
    terms: {
      eyebrow: "服务协议",
      title: "服务条款",
      description: "全球围棋训练与 AI 教学的法律标准。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 26 日",
      status: "全球合规版 v2.5",
      sections: [
        {
          heading: "1. 条款接受与地区例外",
          body: "通过使用 go-daily，您同意这些条款。台湾用户注意：您明确知悉我们的围棋训练服务属于“非以有形媒介提供之数位内容”，一经订阅即开始提供，且您同意放弃《消费者保护法》第 19 条规定的 7 日鉴赏期。",
        },
        {
          heading: "2. 订阅续订 (英国/全球)",
          body: "订阅会自动续订。根据英国 DMCCA 2024，我们会在试用结束前和年度续费前发送提醒通知。您可以通过简单的在线流程随时取消订阅。",
        },
        {
          heading: "3. 免责声明与 AI 启发式",
          body: "AI 教练提供基于专业解说的启发性建议。根据澳大利亚消费者法 (ACL)，我们的服务包含不可排除的法定担保；但我们不保证特定的考级或比赛结果。",
        },
        {
          heading: "4. 管辖法律与仲裁",
          body: "本协议受美国法律管辖。争议应通过个人强制仲裁解决，放弃集体诉讼权利，除非当地消费者法（如欧盟/澳洲强制本地管辖）另有规定。",
        },
      ],
    },
    refund: {
      eyebrow: "商业标准",
      title: "退款政策",
      description: "数字订阅产品的全球退款与取消标准。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 26 日",
      status: "全球合规版 v2.5",
      sections: [
        {
          heading: "1. 数字履约 (标准)",
          body: "订阅激活后，数字履约立即开始。一旦获得 AI 教练和题库访问权，所有销售通常不可退款。",
        },
        {
          heading: "2. 法定冷静期 (英国/欧盟)",
          body: "根据 DMCCA 2024 和欧盟指令 2011/83/EU，英国和欧盟居民在试用结束或年度续费后的 14 天内享有取消权。在此期间内的退款请求将按比例处理（如适用）。",
        },
        {
          heading: "3. 澳大利亚消费者法 (ACL) 担保",
          body: "在澳大利亚，如果我们的数字服务违反了消费者担保（如导致无法使用的持续技术故障），您有权获得补偿，包括全额退款，无论我们的标准“不退款”政策如何规定。",
        },
        {
          heading: "4. 取消与访问权",
          body: "取消将停止未来的扣费。访问权维持至当前计费周期结束。除非当地法律另有规定，月度周期内未使用的时长不予部分退款。",
        },
      ],
    },
    tokushoho: {
      eyebrow: "日本国内法规",
      title: "特定商取引法に基づく表示",
      description: "日本市场要求的法定公示信息。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 26 日",
      status: "法定公示",
      sections: [
        {
          heading: "销售业者 (販売業者)",
          body: "名称：[您的姓名或公司名]（个人开发者可根据请求提供）。",
        },
        {
          heading: "负责人 (運営統括責任者)",
          body: "Frank.",
        },
        {
          heading: "所在地及联系方式",
          body: "地址：[物理地址]。邮箱：support@go-daily.app。电话：根据合规要求在请求时提供。",
        },
        {
          heading: "价格与支付",
          body: "销售价格：标示于定价页（含日本消费税）。支付方式：通过 Stripe 进行信用卡支付。",
        },
      ],
    },
  },
  ja: {
    privacy: {
      eyebrow: "グローバル・プライバシー・フレームワーク",
      title: "プライバシーポリシー",
      description:
        "米国、英国、欧州、豪州、カナダ、香港、韓国の各管轄区域をカバーする包括的なデータ保護。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月26日",
      status: "グローバルコンプライアンス版 v2.5",
      sections: [
        {
          heading: "1. 国際的なデータ転送 (グローバル)",
          body: "go-daily はグローバルに分散したインフラストラクチャを利用しています。ユーザーデータは主にシンガポール (Supabase) と米国 (Vercel) で処理されます。当社は、EU/英国の標準契約条項 (SCCs)、香港の PDPO ベストプラクティス、およびカナダの CPPA 責任原則を含む、国境を越えたデータ転送メカニズムを遵守します。",
        },
        {
          heading: "2. 管轄区域別の開示",
          body: "• 香港: データの取り扱いは個人情報（プライバシー）条例に基づきます。 • カナダ: CPPA/PIPEDA に基づき、お客様のデータに対して最終的な責任を負います。 • 韓国: ローカライズされたサービスを利用することで、シンガポール/米国へのデータ転送に明示的に同意したものとみなされます。",
        },
        {
          heading: "3. AI 対話のセキュリティ",
          body: "コーチとの対話は PII マスキングの上、DeepSeek API に送信されます。プライベートな対話が公開モデルの学習に使用されることはありません。欧州居住者の場合、この処理は「契約の履行」を法的根拠として行われます。",
        },
        {
          heading: "4. データ主体の権利",
          body: "お客様はデータへのアクセス、訂正、または削除の権利を有します。英国居住者は UK GDPR に基づく権利を行使でき、オーストラリア居住者は 1988 年プライバシー法に基づく権利を有します。",
        },
      ],
    },
    terms: {
      eyebrow: "サービス合意書",
      title: "利用規約",
      description: "グローバルな囲碁訓練と AI コーチングのための法的基準。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月26日",
      status: "グローバルコンプライアンス版 v2.5",
      sections: [
        {
          heading: "1. 同意事項と地域別の例外",
          body: "go-daily を利用することで、本規約に同意したものとみなされます。台湾のユーザーへ: 当社のサービスは「有形媒体によらないデジタルコンテンツ」であり、購読後直ちに提供が開始されます。お客様は消費者保護法第 19 条に基づく 7 日間の鑑賞期（クーリングオフ）の権利を放棄することに同意するものとします。",
        },
        {
          heading: "2. サブスクリプションの更新 (英国/グローバル)",
          body: "購読は自動更新されます。英国の DMCCA 2024 に準拠し、トライアル終了前および重要な年間更新前にリマインダー通知を送信します。解約はオンラインで完結するシンプルな手続きで行えます。",
        },
        {
          heading: "3. 免責事項と AI ヒューリスティック",
          body: "AI コーチは専門的な解説に基づいた助言を提供します。オーストラリア消費者法 (ACL) に基づき、当社のサービスには除外できない法定保証が伴いますが、特定の段位や大会結果を保証するものではありません。",
        },
        {
          heading: "4. 準拠法と仲裁",
          body: "本契約は米国法に準拠します。紛争は個別の拘束力のある仲裁によって解決され、現地の消費者法（欧州/豪州の強制的な現地管轄権など）で禁止されている場合を除き、集団訴訟の権利を放棄するものとします。",
        },
      ],
    },
    refund: {
      eyebrow: "商業条件",
      title: "返金ポリシー",
      description: "デジタル商品に関するグローバルな返金およびキャンセル基準。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月26日",
      status: "グローバルコンプライアンス版 v2.5",
      sections: [
        {
          heading: "1. デジタルコンテンツの即時履行",
          body: "サブスクリプションの有効化により、履行が直ちに開始されます。AI コーチおよび問題アーカイブへのアクセスが付与された後の販売は、原則として返金不可となります。",
        },
        {
          heading: "2. 法的なクーリングオフ期間 (英国/欧州)",
          body: "英国および欧州の居住者は、DMCCA 2024 および EU 指令 2011/83/EU に基づき、トライアル終了後または年間更新後の 14 日間、解約権を有します。この期間内の返金リクエストは、適用可能な場合は日割りで処理されます。",
        },
        {
          heading: "3. オーストラリア消費者法 (ACL) の保証",
          body: "オーストラリアにおいて、当社のサービスが消費者保証（継続的な技術障害など）に違反した場合、標準の「返金不可」ポリシーに関わらず、全額返金を含む救済を受ける権利があります。",
        },
        {
          heading: "4. キャンセルとアクセス権",
          body: "解約により将来の請求が停止されます。アクセス権は現在の請求期間終了まで有効です。現地の法定例外を除き、月次サイクルの未使用期間に対する部分返金は行われません。",
        },
      ],
    },
    tokushoho: {
      eyebrow: "日本国内法規",
      title: "特定商取引法に基づく表示",
      description: "日本市場向けの法的開示事項。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月26日",
      status: "法定表示",
      sections: [
        {
          heading: "販売業者",
          body: "名称：[氏名または企業名]（個人開発者の場合、請求により開示します）。",
        },
        {
          heading: "運営統括責任者",
          body: "Frank.",
        },
        {
          heading: "所在地・連絡先",
          body: "所在地：[物理住所]。メール：support@go-daily.app。電話番号：コンプライアンス上の理由により、請求時に提供します。",
        },
        {
          heading: "販売価格・支払方法",
          body: "販売価格：料金ページに表示（消費税込み）。支払方法：Stripe によるクレジットカード決済。",
        },
      ],
    },
  },
  ko: {
    privacy: {
      eyebrow: "글로벌 프라이버시 체계",
      title: "개인정보 처리방침",
      description:
        "미국, 영국, 유럽, 호주, 캐나다, 홍콩, 한국 관할권을 아우르는 포괄적 데이터 보호.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 26일",
      status: "글로벌 컴플라이언스 v2.5",
      sections: [
        {
          heading: "1. 국제 데이터 이전 (글로벌)",
          body: "go-daily는 전 세계적으로 분산된 인프라를 사용합니다. 사용자 데이터는 주로 싱가포르(Supabase) 및 미국(Vercel)에서 처리됩니다. 당사는 EU/영국 표준 계약 조항(SCCs), 홍콩 PDPO 모범 사례, 캐나다 CPPA 책임 원칙을 포함한 국외 데이터 이전 메커니즘을 준수합니다.",
        },
        {
          heading: "2. 관할권별 특정 공시",
          body: "• 홍콩: 데이터 처리는 개인정보(사생활) 조례를 따릅니다. • 캐나다: CPPA/PIPEDA에 따라 귀하의 데이터에 대해 최종적인 책임을 집니다. • 대한민국: 현지화된 서비스를 이용함으로써 싱가포르/미국으로의 데이터 이전에 명시적으로 동의하는 것으로 간주됩니다.",
        },
        {
          heading: "3. AI 상호작용 보안",
          body: "코치와의 대화는 PII 마스킹 처리 후 DeepSeek API로 전송됩니다. 비공개 대화는 공개 모델 학습에 사용되지 않습니다. 유럽 거주자의 경우, 본 처리는 '계약의 이행'을 법적 근거로 수행됩니다.",
        },
        {
          heading: "4. 정보주체의 권리",
          body: "귀하는 데이터에 접근, 정정 또는 삭제할 권리가 있습니다. 영국 거주자는 UK GDPR에 따른 권리를 행사할 수 있으며, 호주 거주자는 1988년 개인정보 보호법에 따른 권리를 보유합니다.",
        },
      ],
    },
    terms: {
      eyebrow: "서비스 약관",
      title: "서비스 이용약관",
      description: "글로벌 바둑 훈련 및 AI 코칭을 위한 법적 표준.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 26일",
      status: "글로벌 컴플라이언스 v2.5",
      sections: [
        {
          heading: "1. 약관 동의 및 지역별 예외",
          body: "go-daily를 이용함으로써 귀하는 본 약관에 동의하게 됩니다. 대만 사용자 안내: 당사의 서비스는 '무형의 디지털 콘텐츠'로서 구독 즉시 제공이 시작됩니다. 귀하는 소비자 보호법 제19조에 따른 7일간의 청약철회 기간(단순 변심 환불) 권리 포기에 동의하는 것으로 간주됩니다.",
        },
        {
          heading: "2. 구독 갱신 (영국/글로벌)",
          body: "구독은 자동 갱신됩니다. 영국 DMCCA 2024를 준수하여 체험 기간 종료 전 및 주요 연간 갱신 전에 안내 통지를 발송합니다. 해지는 온라인에서 간편하게 완료할 수 있습니다.",
        },
        {
          heading: "3. 면책 조항 및 AI 가이드",
          body: "AI 코치는 전문 해설을 기반으로 한 가이드를 제공합니다. 호주 소비자법(ACL)에 따라 당사의 서비스에는 배제할 수 없는 법적 보증이 따르나, 특정 급수나 대회 성적을 보장하지는 않습니다.",
        },
        {
          heading: "4. 준거법 및 중재",
          body: "본 약관은 미국법의 관할을 받습니다. 모든 분쟁은 개별적인 구속력 있는 중재를 통해 해결되며, 현지 소비자법(예: 유럽/호주의 강제적 현지 관할권)에서 금지하지 않는 한 집단 소송 권리를 포기하는 것으로 간주됩니다.",
        },
      ],
    },
    refund: {
      eyebrow: "상거래 약관",
      title: "환불 정책",
      description: "디지털 상품에 대한 글로벌 환불 및 취소 기준.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 26일",
      status: "글로벌 컴플라이언스 v2.5",
      sections: [
        {
          heading: "1. 디지털 이행 (표준)",
          body: "구독 활성화 시 디지털 이행이 즉시 시작됩니다. AI 코치 및 문제 아카이브에 대한 접근 권한이 부여된 후의 결제 건은 원칙적으로 환불이 불가능합니다.",
        },
        {
          heading: "2. 법적 청약철회 기간 (영국/유럽)",
          body: "영국 및 유럽 거주자는 DMCCA 2024 및 EU 지침 2011/83/EU에 따라 체험 기간 종료 후 또는 연간 갱신 후 14일 이내에 취소권을 가집니다. 이 기간 내의 환불 요청은 가능한 경우 일할 계산되어 처리됩니다.",
        },
        {
          heading: "3. 호주 소비자법(ACL) 보증",
          body: "호주 내에서 당사의 서비스가 소비자 보증(지속적인 기술적 결함 등)을 위반한 경우, 당사의 표준 '환불 불가' 정책과 관계없이 전액 환불을 포함한 구제 권리가 보장됩니다.",
        },
        {
          heading: "4. 취소 및 접근권",
          body: "취소 시 향후 결제가 중단됩니다. 접근 권한은 현재 결제 주기가 끝날 때까지 유지됩니다. 현지 법적 예외를 제외하고, 월간 주기의 미사용 기간에 대한 부분 환불은 제공되지 않습니다.",
        },
      ],
    },
    tokushoho: {
      eyebrow: "일본 국내 법규",
      title: "특정상거래법에 따른 표시 (일본)",
      description: "일본 시장을 위한 법적 공시 사항.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 26일",
      status: "법적 공시",
      sections: [
        {
          heading: "판매업자",
          body: "명칭: [성명 또는 법인명] (개인 개발자의 경우 요청 시 개시함).",
        },
        {
          heading: "운영 총괄 책임자",
          body: "Frank.",
        },
        {
          heading: "소재지 및 연락처",
          body: "소재지: [물리적 주소]. 이메일: support@go-daily.app. 전화번호: 컴플라이언스 상의 이유로 요청 시 제공함.",
        },
        {
          heading: "판매 가격 및 결제 방식",
          body: "판매 가격: 가격 페이지에 표시 (일본 소비세 포함). 결제 방식: Stripe를 통한 신용카드 결제.",
        },
      ],
    },
  },
};

export function getLegalCopy(locale: Locale, kind: LegalKind): LegalCopy {
  return copy[locale]?.[kind] ?? copy.en[kind];
}

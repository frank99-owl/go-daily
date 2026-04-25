import type { Locale } from "@/types";

export type LegalKind = "privacy" | "terms" | "refund";

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
};

const copy: Record<Locale, Record<LegalKind, LegalCopy>> = {
  en: {
    privacy: {
      eyebrow: "Legal placeholder",
      title: "Privacy Policy",
      description:
        "A concise privacy placeholder for Stripe review. Final legal text should be reviewed before paid launch.",
      updatedLabel: "Last updated",
      updatedValue: "April 23, 2026",
      status: "Draft for pre-launch setup",
      sections: [
        {
          heading: "Data we expect to handle",
          body: "go-daily may process account email, authentication identifiers, language and timezone preferences, puzzle attempts, device identifiers for sync and access control, analytics events, and error telemetry.",
        },
        {
          heading: "How the data is used",
          body: "The data is used to operate login, sync progress across devices, provide the AI coach, protect the service from abuse, diagnose errors, and improve the product experience.",
        },
        {
          heading: "Your choices",
          body: "Users can delete their Supabase account from the account page today. Stripe customer deletion, analytics deletion, and final compliance language are scheduled for the legal/compliance phase before full commercial launch.",
        },
      ],
    },
    terms: {
      eyebrow: "Legal placeholder",
      title: "Terms of Service",
      description:
        "Draft service terms for setup. Replace with reviewed terms before accepting paid subscriptions.",
      updatedLabel: "Last updated",
      updatedValue: "April 23, 2026",
      status: "Draft for pre-launch setup",
      sections: [
        {
          heading: "Service scope",
          body: "go-daily provides Go puzzle practice, progress tracking, and an AI-assisted coach. The coach explains provided solution notes and should not be treated as a tournament judge or professional certification.",
        },
        {
          heading: "Accounts and acceptable use",
          body: "Users are responsible for their account access. Automated abuse, attempts to bypass rate limits, scraping private APIs, or interfering with service availability are not permitted.",
        },
        {
          heading: "Paid subscriptions",
          body: "Paid-plan details, trial behavior, cancellation flow, and final subscription terms will be finalized before Stripe checkout is enabled in production.",
        },
      ],
    },
    refund: {
      eyebrow: "Legal placeholder",
      title: "Refund Policy",
      description:
        "Pre-launch refund placeholder. Final refund wording should match the Stripe product setup before payments go live.",
      updatedLabel: "Last updated",
      updatedValue: "April 23, 2026",
      status: "Draft for pre-launch setup",
      sections: [
        {
          heading: "Current status",
          body: "go-daily is preparing paid subscriptions. If checkout is not enabled yet, no paid subscription charge is collected by the app.",
        },
        {
          heading: "Planned trial",
          body: "The current product plan is a 7-day card trial through Stripe. Trial, cancellation, and billing copy should stay consistent across the pricing page, Stripe Checkout, and this policy.",
        },
        {
          heading: "Refund handling",
          body: "After paid launch, refund requests should be handled through support and Stripe according to the finalized commercial policy and applicable law.",
        },
      ],
    },
  },
  zh: {
    privacy: {
      eyebrow: "法务占位",
      title: "隐私政策",
      description: "供 Stripe 审核准备使用的简版隐私占位。正式收费前应替换为审阅后的正文。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 23 日",
      status: "上线前设置草稿",
      sections: [
        {
          heading: "预计处理的数据",
          body: "go-daily 可能处理账号邮箱、登录身份标识、语言和时区偏好、做题记录、用于同步和访问控制的设备标识、分析事件以及错误遥测。",
        },
        {
          heading: "数据用途",
          body: "这些数据用于提供登录、跨设备同步、AI 教练、防滥用、错误诊断以及产品体验改进。",
        },
        {
          heading: "用户选择",
          body: "当前用户可以在账户页删除 Supabase 账号。Stripe customer 删除、分析数据删除以及最终合规文案会在正式商业发布前的法务合规阶段补齐。",
        },
      ],
    },
    terms: {
      eyebrow: "法务占位",
      title: "服务条款",
      description: "用于前期设置的服务条款草稿。接受付费订阅前应替换为审阅后的版本。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 23 日",
      status: "上线前设置草稿",
      sections: [
        {
          heading: "服务范围",
          body: "go-daily 提供围棋题练习、进度记录和 AI 辅助讲解。AI 教练解释的是已提供的解题说明，不应被视为比赛裁判或专业认证。",
        },
        {
          heading: "账号与合理使用",
          body: "用户需对自己的账号访问负责。禁止自动化滥用、绕过限流、抓取私有 API 或干扰服务可用性。",
        },
        {
          heading: "付费订阅",
          body: "付费档位、试用规则、取消流程和最终订阅条款会在生产环境启用 Stripe Checkout 前确定。",
        },
      ],
    },
    refund: {
      eyebrow: "法务占位",
      title: "退款政策",
      description: "上线前退款政策占位。正式收款前应与 Stripe 产品配置保持一致。",
      updatedLabel: "最后更新",
      updatedValue: "2026 年 4 月 23 日",
      status: "上线前设置草稿",
      sections: [
        {
          heading: "当前状态",
          body: "go-daily 正在准备付费订阅。如果 Checkout 尚未启用，应用不会收取付费订阅费用。",
        },
        {
          heading: "计划中的试用",
          body: "当前产品计划是通过 Stripe 提供 7 天带卡试用。试用、取消和计费文案应在定价页、Stripe Checkout 和本政策中保持一致。",
        },
        {
          heading: "退款处理",
          body: "付费上线后，退款请求应通过支持渠道和 Stripe，按照最终商业政策及适用法律处理。",
        },
      ],
    },
  },
  ja: {
    privacy: {
      eyebrow: "法務プレースホルダー",
      title: "プライバシーポリシー",
      description:
        "Stripe 審査準備用の簡易プレースホルダーです。有料公開前にレビュー済みの本文へ差し替えてください。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月23日",
      status: "公開前設定用ドラフト",
      sections: [
        {
          heading: "取り扱う可能性のあるデータ",
          body: "go-daily は、アカウントのメールアドレス、認証 ID、言語とタイムゾーン設定、問題の回答履歴、同期とアクセス制御のためのデバイス ID、分析イベント、エラーテレメトリを処理する場合があります。",
        },
        {
          heading: "利用目的",
          body: "これらのデータは、ログイン、端末間同期、AI コーチ、防止策、エラー診断、プロダクト改善のために使用されます。",
        },
        {
          heading: "ユーザーの選択",
          body: "現在、ユーザーはアカウントページから Supabase アカウントを削除できます。Stripe 顧客データ削除、分析データ削除、最終的なコンプライアンス文言は商用公開前の法務フェーズで整備します。",
        },
      ],
    },
    terms: {
      eyebrow: "法務プレースホルダー",
      title: "利用規約",
      description:
        "初期設定用の規約ドラフトです。有料サブスクリプションを受け付ける前にレビュー済みの規約へ差し替えてください。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月23日",
      status: "公開前設定用ドラフト",
      sections: [
        {
          heading: "サービス範囲",
          body: "go-daily は囲碁問題の練習、進捗記録、AI による補助解説を提供します。AI コーチは提供済みの解説を説明するもので、対局審判や専門資格ではありません。",
        },
        {
          heading: "アカウントと適切な利用",
          body: "ユーザーは自身のアカウント管理に責任を負います。自動化された濫用、レート制限の回避、非公開 API のスクレイピング、サービス可用性への妨害は禁止です。",
        },
        {
          heading: "有料サブスクリプション",
          body: "有料プラン、トライアル、キャンセル手順、最終的な購読条件は、本番環境で Stripe Checkout を有効化する前に確定します。",
        },
      ],
    },
    refund: {
      eyebrow: "法務プレースホルダー",
      title: "返金ポリシー",
      description:
        "公開前の返金ポリシープレースホルダーです。支払い開始前に Stripe の商品設定と一致させてください。",
      updatedLabel: "最終更新",
      updatedValue: "2026年4月23日",
      status: "公開前設定用ドラフト",
      sections: [
        {
          heading: "現在の状態",
          body: "go-daily は有料サブスクリプションを準備中です。Checkout がまだ有効でない場合、アプリは有料購読料金を請求しません。",
        },
        {
          heading: "予定しているトライアル",
          body: "現在の計画では、Stripe 経由でカード登録付き 7 日間トライアルを提供します。トライアル、キャンセル、請求文言は価格ページ、Stripe Checkout、本ポリシーで一貫させる必要があります。",
        },
        {
          heading: "返金対応",
          body: "有料公開後、返金リクエストはサポートと Stripe を通じ、最終的な商用ポリシーおよび適用法に従って処理します。",
        },
      ],
    },
  },
  ko: {
    privacy: {
      eyebrow: "법무 자리표시자",
      title: "개인정보 처리방침",
      description:
        "Stripe 검토 준비용 간단한 자리표시자입니다. 유료 출시 전 검토된 본문으로 교체해야 합니다.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 23일",
      status: "출시 전 설정용 초안",
      sections: [
        {
          heading: "처리할 수 있는 데이터",
          body: "go-daily는 계정 이메일, 인증 식별자, 언어 및 시간대 설정, 문제 풀이 기록, 동기화와 접근 제어를 위한 기기 식별자, 분석 이벤트, 오류 원격 측정 데이터를 처리할 수 있습니다.",
        },
        {
          heading: "데이터 사용 목적",
          body: "이 데이터는 로그인, 기기 간 동기화, AI 코치, 남용 방지, 오류 진단, 제품 경험 개선을 위해 사용됩니다.",
        },
        {
          heading: "사용자 선택권",
          body: "현재 사용자는 계정 페이지에서 Supabase 계정을 삭제할 수 있습니다. Stripe 고객 삭제, 분석 데이터 삭제, 최종 준수 문구는 정식 상용 출시 전 법무 단계에서 보완합니다.",
        },
      ],
    },
    terms: {
      eyebrow: "법무 자리표시자",
      title: "서비스 약관",
      description:
        "초기 설정용 약관 초안입니다. 유료 구독을 받기 전에 검토된 약관으로 교체해야 합니다.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 23일",
      status: "출시 전 설정용 초안",
      sections: [
        {
          heading: "서비스 범위",
          body: "go-daily는 바둑 문제 연습, 진행 상황 기록, AI 보조 해설을 제공합니다. AI 코치는 제공된 해설을 설명하는 용도이며 대회 판정이나 전문 인증으로 간주해서는 안 됩니다.",
        },
        {
          heading: "계정과 허용되는 사용",
          body: "사용자는 자신의 계정 접근을 관리할 책임이 있습니다. 자동화된 남용, 속도 제한 우회, 비공개 API 스크래핑, 서비스 가용성 방해는 허용되지 않습니다.",
        },
        {
          heading: "유료 구독",
          body: "유료 플랜, 체험 기간, 취소 흐름, 최종 구독 약관은 프로덕션에서 Stripe Checkout을 활성화하기 전에 확정합니다.",
        },
      ],
    },
    refund: {
      eyebrow: "법무 자리표시자",
      title: "환불 정책",
      description:
        "출시 전 환불 정책 자리표시자입니다. 결제 시작 전 Stripe 제품 설정과 일치하도록 조정해야 합니다.",
      updatedLabel: "마지막 업데이트",
      updatedValue: "2026년 4월 23일",
      status: "출시 전 설정용 초안",
      sections: [
        {
          heading: "현재 상태",
          body: "go-daily는 유료 구독을 준비 중입니다. Checkout이 아직 활성화되지 않았다면 앱에서 유료 구독 요금을 청구하지 않습니다.",
        },
        {
          heading: "예정된 체험 기간",
          body: "현재 제품 계획은 Stripe를 통한 카드 등록형 7일 무료 체험입니다. 체험, 취소, 청구 문구는 가격 페이지, Stripe Checkout, 본 정책에서 일관되어야 합니다.",
        },
        {
          heading: "환불 처리",
          body: "유료 출시 후 환불 요청은 지원 채널과 Stripe를 통해 최종 상업 정책 및 적용 법률에 따라 처리합니다.",
        },
      ],
    },
  },
};

export function getLegalCopy(locale: Locale, kind: LegalKind): LegalCopy {
  return copy[locale]?.[kind] ?? copy.en[kind];
}

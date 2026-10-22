// 청구서의 결제 수단. 개인카드만 회원이 먼저 내고 돌려받는다(영수증 필요).
export const PAY_METHODS = ["biz_card", "personal_card", "biz_transfer"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export function toPayMethod(value: string): PayMethod {
  return (PAY_METHODS as readonly string[]).includes(value) ? (value as PayMethod) : "biz_card";
}

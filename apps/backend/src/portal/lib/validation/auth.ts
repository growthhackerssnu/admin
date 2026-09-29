import { z } from "zod";

export const signupRequestSchema = z.object({
  cohort: z.string().trim().min(1, "기수를 입력하세요."),
  name: z.string().trim().min(1, "이름을 입력하세요."),
  desiredEmail: z.string().trim().email("올바른 이메일 형식이 아닙니다."),
});

export const verifySignupRequestSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, "6자리 숫자를 입력하세요."),
});

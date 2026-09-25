import { useEffect, useState } from "react";
import { Alert, App as AntApp, Button, Form, Input, Segmented, Skeleton, Typography } from "antd";
import { ApiClientError, createSignupRequest, getMe, verifySignupRequest } from "../lib/api";
import { signInWithGoogle, signOut } from "../lib/supabase";
import { useSession } from "../hooks/useSession";

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

type Mode = "login" | "signup";
type SignupStep = "form" | "otp" | "done";

// gateway는 production에서 /dh, /hr을 같은 origin 아래로 rewrite하므로 상대
// 경로면 충분하다. 로컬은 앱마다 포트가 달라서, 있으면 절대 URL로 덮어쓴다.
function resolveRedirect(path: string): string {
  if (path === "/dh" && import.meta.env.VITE_DH_URL) return import.meta.env.VITE_DH_URL;
  if (path === "/hr" && import.meta.env.VITE_HR_URL) return import.meta.env.VITE_HR_URL;
  return path;
}

export function Login() {
  const { message } = AntApp.useApp();
  const session = useSession();

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<SignupStep>("form");
  const [busy, setBusy] = useState(false);

  const [cohort, setCohort] = useState("");
  const [name, setName] = useState("");
  const [desiredEmail, setDesiredEmail] = useState("");

  const [signupRequestId, setSignupRequestId] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [otp, setOtp] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_OTP_ATTEMPTS);
  const [otpError, setOtpError] = useState<string>();
  const [terminalFailure, setTerminalFailure] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // 이미 로그인된 세션으로 이 페이지(또는 OAuth 리다이렉트 대상인 "/")에
  // 도달하면, /me로 role을 물어서 있어야 할 곳(관리자/dh/hr)으로 곧장 보낸다.
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!session) return;
    setRedirecting(true);
    (async () => {
      try {
        const me = await getMe(session.access_token);
        window.location.href = resolveRedirect(me.redirectPath);
      } catch {
        setRedirecting(false);
        void message.error("계정 정보를 확인하지 못했습니다. 관리자에게 문의하세요.");
        await signOut();
      }
    })();
  }, [session]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function resetSignup() {
    setStep("form");
    setSignupRequestId(undefined);
    setSentTo(undefined);
    setOtp("");
    setAttemptsLeft(MAX_OTP_ATTEMPTS);
    setOtpError(undefined);
    setTerminalFailure(false);
    setCooldown(0);
  }

  async function submitSignupForm() {
    if (!cohort.trim() || !name.trim() || !desiredEmail.trim()) {
      void message.warning("기수·이름·이메일을 모두 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await createSignupRequest({ cohort: cohort.trim(), name: name.trim(), desiredEmail: desiredEmail.trim() });
      setSignupRequestId(result.signupRequestId);
      setSentTo(result.sentTo);
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      if (e instanceof ApiClientError) void message.error(e.message);
      else void message.error("가입 신청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (cooldown > 0) return;
    setBusy(true);
    try {
      const result = await createSignupRequest({ cohort: cohort.trim(), name: name.trim(), desiredEmail: desiredEmail.trim() });
      setSignupRequestId(result.signupRequestId);
      setSentTo(result.sentTo);
      setOtp("");
      setOtpError(undefined);
      setAttemptsLeft(MAX_OTP_ATTEMPTS);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      void message.success("인증코드를 다시 보냈습니다.");
    } catch (e) {
      if (e instanceof ApiClientError) void message.error(e.message);
      else void message.error("재전송 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp() {
    if (!signupRequestId || !otp.trim()) return;
    setBusy(true);
    setOtpError(undefined);
    try {
      await verifySignupRequest(signupRequestId, otp.trim());
      setStep("done");
    } catch (e) {
      const isExhausted =
        e instanceof ApiClientError &&
        (e.message.includes("만료") || e.message.includes("초과"));
      if (isExhausted) {
        setTerminalFailure(true);
      } else if (e instanceof ApiClientError) {
        setOtpError(e.message);
        setAttemptsLeft((n) => Math.max(0, n - 1));
      } else {
        setOtpError("인증 중 오류가 발생했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      void message.error("Google 로그인을 시작할 수 없습니다.");
      setBusy(false);
    }
  }

  if (session === undefined || redirecting) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          대협 어드민
        </Typography.Title>
        <Typography.Text type="secondary">GROWTHHACKERS</Typography.Text>

        <Segmented
          block
          style={{ margin: "24px 0" }}
          value={mode}
          onChange={(v) => {
            setMode(v as Mode);
            resetSignup();
          }}
          options={[
            { label: "Google로 로그인", value: "login" },
            { label: "Google로 회원가입", value: "signup" },
          ]}
        />

        {mode === "login" && (
          <div className="stack">
            <Typography.Paragraph type="secondary">
              이미 가입한 계정으로 Google 로그인합니다.
            </Typography.Paragraph>
            <Button type="primary" block size="large" loading={busy} onClick={handleGoogleLogin}>
              Google로 로그인
            </Button>
          </div>
        )}

        {mode === "signup" && step === "form" && (
          <Form layout="vertical" onFinish={submitSignupForm}>
            <Form.Item label="기수" required>
              <Input value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="예: 19" disabled={busy} />
            </Form.Item>
            <Form.Item label="이름" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 박지윤" disabled={busy} />
            </Form.Item>
            <Form.Item label="사용할 구글 이메일" required>
              <Input
                type="email"
                value={desiredEmail}
                onChange={(e) => setDesiredEmail(e.target.value)}
                placeholder="앞으로 로그인에 쓸 구글 계정"
                disabled={busy}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={busy}>
              인증코드 받기
            </Button>
          </Form>
        )}

        {mode === "signup" && step === "otp" && !terminalFailure && (
          <div className="stack">
            <Alert
              type="info"
              showIcon
              message="인증코드가 발송됐습니다"
              description={`그로스해커스 홈페이지에 등록된 이메일(${sentTo})로 인증코드를 보냈습니다. 메일함을 확인해 6자리 코드를 입력해주세요.`}
            />
            <Form layout="vertical" onFinish={submitOtp}>
              <Form.Item
                label="인증코드"
                validateStatus={otpError ? "error" : undefined}
                help={otpError}
              >
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6자리 숫자"
                  maxLength={6}
                  disabled={busy}
                  autoFocus
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={busy} disabled={otp.length !== 6}>
                인증하기
              </Button>
            </Form>
            <Button block disabled={cooldown > 0 || busy} onClick={resendOtp}>
              {cooldown > 0 ? `인증코드 재전송 (${cooldown}초 후 가능)` : "인증코드 재전송"}
            </Button>
            <Button type="link" onClick={resetSignup}>
              ← 처음부터 다시
            </Button>
          </div>
        )}

        {mode === "signup" && terminalFailure && (
          <div className="stack">
            <Alert
              type="error"
              showIcon
              message="인증에 실패했습니다"
              description="관리자에게 문의하세요."
            />
            <Button block onClick={resetSignup}>
              처음부터 다시 신청
            </Button>
          </div>
        )}

        {mode === "signup" && step === "done" && (
          <div className="stack">
            <Alert
              type="success"
              showIcon
              message="가입이 완료됐습니다"
              description={`${desiredEmail} 계정으로 Google 로그인해주세요.`}
            />
            <Button
              type="primary"
              block
              size="large"
              loading={busy}
              onClick={handleGoogleLogin}
            >
              Google로 로그인
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

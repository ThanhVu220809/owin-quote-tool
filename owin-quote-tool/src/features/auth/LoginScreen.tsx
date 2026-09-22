import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import type { OAuthProviderId } from "@/features/auth/authSession";
import {
  PASSWORD_RESET_OTP_LENGTH,
  getRememberSignIn,
  resetPasswordWithOtp,
  sendPasswordResetOtp,
  setRememberSignIn,
  signInWithOAuth,
  signInWithPassword,
} from "@/features/auth/authSession";
import { useAppearance } from "@/features/settings/appearance";
import "./login.css";

const appearances = [
  { value: "light", label: "Sáng", Icon: Sun },
  { value: "dark", label: "Tối", Icon: Moon },
  { value: "system", label: "Theo máy", Icon: Monitor },
] as const;

/** lucide-react không còn icon thương hiệu, nên vẽ thẳng logo ở đây. */
function GoogleMark() {
  return (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#1877F2"
        d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9Z"
      />
    </svg>
  );
}

const oauthProviders: Array<{
  id: OAuthProviderId;
  label: string;
  Mark: () => React.ReactElement;
}> = [
  { id: "google", label: "Google", Mark: GoogleMark },
  { id: "facebook", label: "Facebook", Mark: FacebookMark },
];

export function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(getRememberSignIn);
  const [recoveryStep, setRecoveryStep] = useState<
    "closed" | "request" | "verify"
  >("closed");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [oauthBusy, setOauthBusy] = useState<OAuthProviderId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appearance, setAppearance] = useAppearance();
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await signInWithPassword(identifier, password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể đăng nhập lúc này. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = async (provider: OAuthProviderId) => {
    if (busy || oauthBusy) return;
    setOauthBusy(provider);
    setError("");
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể đăng nhập lúc này. Vui lòng thử lại.",
      );
      setOauthBusy(null);
    }
    // Thành công thì trình duyệt đã rời trang, không cần tắt trạng thái chờ.
  };

  const toggleRemember = (next: boolean) => {
    setRemember(next);
    // Ghi ngay, không đợi bấm Đăng nhập: phiên OAuth được lưu ở tiến trình khác.
    setRememberSignIn(next);
  };

  const requestOtp = async () => {
    const target = identifier.trim();
    if (!target || recoveryBusy) return;
    setRecoveryBusy(true);
    setError("");
    try {
      setRecoveryEmail(await sendPasswordResetOtp(target));
      setOtp("");
      setNewPassword("");
      setRecoveryStep("verify");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không gửi được email lúc này. Vui lòng thử lại.",
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  const confirmOtp = async () => {
    if (
      recoveryBusy ||
      otp.length !== PASSWORD_RESET_OTP_LENGTH ||
      newPassword.length < 8
    )
      return;
    setRecoveryBusy(true);
    setError("");
    try {
      await resetPasswordWithOtp(recoveryEmail, otp, newPassword);
      // Đổi xong là đã đăng nhập luôn, AuthGate tự chuyển sang app.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không đổi được mật khẩu. Vui lòng thử lại.",
      );
    } finally {
      setRecoveryBusy(false);
    }
  };
  return (
    <div
      className="login-premium"
      data-appearance={
        appearance === "system" ? (systemDark ? "dark" : "light") : appearance
      }
    >
      <header className="login-header">
        <a
          className="login-wordmark"
          href={import.meta.env.BASE_URL}
          aria-label="OWIN trang chủ"
        >
          <img
            src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`}
            width="40"
            height="40"
            alt=""
          />
          <span>OWIN</span>
        </a>
        <div
          className="login-appearance"
          role="group"
          aria-label="Chế độ giao diện"
        >
          {appearances.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={`Giao diện ${label.toLowerCase()}`}
              aria-pressed={appearance === value}
              onClick={() => setAppearance(value)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>
      <main className="login-scroll">
        <div className="login-layout">
          <section className="login-story" aria-label="Giới thiệu OWIN">
            <div className="login-story-copy">
              <span className="login-eyebrow">Báo giá nhôm kính</span>
            </div>
            <svg
              className="login-architecture"
              viewBox="0 0 680 516"
              preserveAspectRatio="xMidYMax meet"
              role="img"
              aria-label="Hình vẽ một căn nhà có cửa nhôm kính lớn"
            >
              <defs>
                <clipPath id="arch-clip">
                  <rect width="680" height="516" />
                </clipPath>
              </defs>
              <g clipPath="url(#arch-clip)">
                <rect className="arch-bg" width="680" height="516" />
                <g className="arch-scene">
                  <path d="M0 290H680V516H0Z" fill="#dfe2ea" />
                  <path d="M85 90 470 30 614 99 230 154Z" fill="#fbfbfd" />
                  <path d="M85 90 230 154V337L85 272Z" fill="#dde0e8" />
                  <path d="M230 154 614 99V283L230 337Z" fill="#f5f6fa" />
                  <path d="M255 167 590 119V273L255 320Z" fill="#4b5568" />
                  <path d="M266 176 579 131V264L266 308Z" fill="#c4dbee" />
                  <path d="M266 250 579 166V264L266 308Z" fill="#d7e6f4" />
                  <path
                    d="M330 167V301M410 155V289M492 143V278"
                    stroke="#4b5568"
                    strokeWidth="8"
                  />
                  <path
                    d="M272 186 319 179M344 176 397 168M426 164 479 156M506 152 566 143"
                    stroke="#f6fbfe"
                    strokeWidth="3"
                  />
                  <path d="M232 338 614 284 653 302 268 358Z" fill="#d4d8e1" />
                  <path d="M106 143 188 180V283L106 246Z" fill="#aabfd4" />
                  <path d="M147 162V264" stroke="#5e6b80" strokeWidth="5" />
                  <circle cx="61" cy="237" r="32" fill="#93c9a7" />
                  <circle cx="48" cy="211" r="26" fill="#a8d6b2" />
                  <path d="M58 253V304" stroke="#8d9c8b" strokeWidth="5" />
                  <path d="M550 328H615" stroke="#b9bfc9" strokeWidth="3" />
                </g>
              </g>
            </svg>
            <div className="login-story-footer">
              <span>Dành cho công việc mỗi ngày</span>
              <span>OWIN</span>
            </div>
          </section>
          <section className="login-form-region" aria-labelledby="login-title">
            <form className="login-form" onSubmit={submit} aria-busy={busy}>
              <h2 id="login-title">Đăng nhập</h2>
              <label className="login-field" htmlFor="login-identifier">
                Tên đăng nhập hoặc email
              </label>
              <input
                id="login-identifier"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Nhập tên đăng nhập hoặc email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={busy}
                aria-describedby={error ? "login-error" : undefined}
              />
              <label className="login-field" htmlFor="login-password">
                Mật khẩu
              </label>
              <div className="login-password">
                <input
                  id="login-password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={visible}
                >
                  {visible ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <button
                className="login-forgot"
                type="button"
                aria-expanded={recoveryStep !== "closed"}
                aria-controls="login-recovery"
                onClick={() =>
                  setRecoveryStep((step) =>
                    step === "closed" ? "request" : "closed",
                  )
                }
              >
                Quên mật khẩu?
              </button>
              {recoveryStep === "request" && (
                <div
                  className="login-recovery"
                  id="login-recovery"
                  role="status"
                >
                  Nhập tên đăng nhập hoặc email ở ô phía trên, rồi bấm gửi.
                  Chúng tôi sẽ gửi mã xác nhận {PASSWORD_RESET_OTP_LENGTH} số
                  tới email của tài khoản đó.
                  <button
                    type="button"
                    className="login-recovery-send"
                    onClick={requestOtp}
                    disabled={recoveryBusy || !identifier.trim()}
                  >
                    {recoveryBusy ? "Đang gửi…" : "Gửi mã xác nhận"}
                  </button>
                </div>
              )}
              {recoveryStep === "verify" && (
                <div
                  className="login-recovery"
                  id="login-recovery"
                  role="status"
                >
                  Nếu <strong>{recoveryEmail}</strong> là tài khoản hợp lệ, mã
                  xác nhận đã được gửi tới hộp thư đó. Kiểm tra cả thư rác.
                  <label className="login-recovery-label" htmlFor="login-otp">
                    Mã xác nhận
                  </label>
                  <input
                    id="login-otp"
                    className="login-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={PASSWORD_RESET_OTP_LENGTH}
                    placeholder={"0".repeat(PASSWORD_RESET_OTP_LENGTH)}
                    value={otp}
                    onChange={(e) =>
                      setOtp(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, PASSWORD_RESET_OTP_LENGTH),
                      )
                    }
                    disabled={recoveryBusy}
                  />
                  <label
                    className="login-recovery-label"
                    htmlFor="login-new-password"
                  >
                    Mật khẩu mới
                  </label>
                  <input
                    id="login-new-password"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={recoveryBusy}
                  />
                  {newPassword.length > 0 && newPassword.length < 8 && (
                    <p className="login-recovery-hint">
                      Mật khẩu cần ít nhất 8 ký tự.
                    </p>
                  )}
                  <button
                    type="button"
                    className="login-recovery-send"
                    onClick={confirmOtp}
                    disabled={
                      recoveryBusy ||
                      otp.length !== PASSWORD_RESET_OTP_LENGTH ||
                      newPassword.length < 8
                    }
                  >
                    {recoveryBusy
                      ? "Đang đổi mật khẩu…"
                      : "Xác nhận và đổi mật khẩu"}
                  </button>
                  <button
                    type="button"
                    className="login-recovery-resend"
                    onClick={requestOtp}
                    disabled={recoveryBusy}
                  >
                    Gửi lại mã
                  </button>
                </div>
              )}
              {error && (
                <p className="login-feedback" id="login-error" role="alert">
                  {error}
                </p>
              )}
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => toggleRemember(e.target.checked)}
                  disabled={busy}
                />
                <span>Ghi nhớ đăng nhập</span>
              </label>
              <button
                className="login-submit"
                type="submit"
                disabled={busy || !identifier.trim() || !password}
              >
                {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                {busy ? (
                  <LoaderCircle className="login-spinner" size={19} />
                ) : (
                  <ArrowRight size={19} />
                )}
              </button>

              <div className="login-divider">
                <span>hoặc</span>
              </div>
              <div className="login-oauth">
                {oauthProviders.map(({ id, label, Mark }) => (
                  <button
                    key={id}
                    type="button"
                    className="login-oauth-button"
                    onClick={() => startOAuth(id)}
                    disabled={busy || oauthBusy !== null}
                    aria-label={`Tiếp tục với ${label}`}
                  >
                    {oauthBusy === id ? (
                      <LoaderCircle className="login-spinner" size={18} />
                    ) : (
                      <Mark />
                    )}
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="login-help">
                Chưa có tài khoản?
                <br />
                <span>Liên hệ OWIN để được hỗ trợ.</span>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}



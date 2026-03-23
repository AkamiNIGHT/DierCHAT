import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/api/client';
import { useStore } from '@/store';
import wsClient from '@/api/ws';
import { getWebSocketHttpBaseUrl } from '@/lib/publicApiUrl';
import { ChevronDown, Camera, AlertCircle, ArrowLeft } from 'lucide-react';
import './AuthScreen.css';

type Step = 'email' | 'code' | 'password' | 'profile' | 'forgot' | 'reset';

const RESEND_COOLDOWN = 30;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthScreenProps { needsProfile?: boolean; }

export function AuthScreen({ needsProfile = false }: AuthScreenProps) {
  const [step, setStep] = useState<Step>(needsProfile ? 'profile' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [password, setPassword] = useState('');
  const [temp2fa, setTemp2fa] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { token, user, setToken, setUser } = useStore();

  useEffect(() => {
    if (needsProfile && user) {
      setStep('profile');
      const parts = (user.display_name || '').split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setUsername(user.username || '');
    }
  }, [needsProfile, user]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  useEffect(() => {
    if (step === 'code') codeInputRefs.current[0]?.focus();
  }, [step]);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const codeStr = code.join('');

  function handleCodeChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) codeInputRefs.current[idx + 1]?.focus();
  }

  function handleCodeKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      const next = [...code];
      next[idx - 1] = '';
      setCode(next);
      codeInputRefs.current[idx - 1]?.focus();
    }
  }

  /** ТЗ §1: вставка 6 цифр из буфера (SMS / почта / автозаполнение) */
  function handleCodePaste(e: React.ClipboardEvent) {
    const raw = e.clipboardData.getData('text') || '';
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (digits.length < 6) return;
    e.preventDefault();
    const next = digits.split('');
    while (next.length < 6) next.push('');
    setCode(next.slice(0, 6));
    codeInputRefs.current[5]?.focus();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!emailRegex.test(trimmed)) {
      showError('Введите корректный email');
      return;
    }
    setLoading(true);
    try {
      await api.sendCode(trimmed);
      setStep('code');
      setResendTimer(RESEND_COOLDOWN);
      setCode(['', '', '', '', '', '']);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка отправки кода');
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (codeStr.length !== 6) return;
    setLoading(true);
    try {
      const res = await api.verifyCode(email.trim().toLowerCase(), codeStr);
      if ('needs_2fa' in res && res.needs_2fa) {
        setTemp2fa(res.temp_2fa);
        setUser(res.user);
        setStep('password');
        setPassword('');
        return;
      }
      api.setToken(res.token);
      setToken(res.token);
      setUser(res.user);
      if (!res.user.username) {
        const parts = (res.user.display_name || '').split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
        setStep('profile');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Неверный код';
      showError(msg.includes('много') ? 'Слишком много попыток. Подождите 10 минут.' : msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await api.verify2FA(temp2fa, password);
      api.setToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Неверный пароль');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!emailRegex.test(trimmed)) {
      showError('Введите корректный email');
      return;
    }
    setLoading(true);
    try {
      await api.forgotPassword(trimmed);
      setStep('reset');
      setCode(['', '', '', '', '', '']);
      setResendTimer(RESEND_COOLDOWN);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (codeStr.length !== 6 || !newPassword.trim()) {
      showError('Введите код и новый пароль');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Пароли не совпадают');
      return;
    }
    if (newPassword.length < 6) {
      showError('Пароль минимум 6 символов');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(email.trim().toLowerCase(), codeStr, newPassword);
      setStep('email');
      setCode(['', '', '', '', '', '']);
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка сброса');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      await api.sendCode(email.trim().toLowerCase());
      setResendTimer(RESEND_COOLDOWN);
      setError('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка повторной отправки');
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarClick() { fileInputRef.current?.click(); }
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) { showError('Введите имя'); return; }
    if (!username.trim()) { showError('Введите имя пользователя'); return; }
    setError('');
    setLoading(true);
    try {
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      let avatarUrl: string | undefined;
      if (avatarFile) {
        try {
          const uploaded = await api.uploadFile(avatarFile);
          avatarUrl = uploaded.url;
        } catch {}
      }
      await api.updateProfile(
        displayName,
        username.trim().replace(/^@/, ''),
        '',
        avatarUrl
      );
      const updated = await api.getMe();
      setUser(updated);
      if (token) {
        const base = getWebSocketHttpBaseUrl() || window.location.origin;
        wsClient.connect(base, token);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  }

  // --- Email Step ---
  if (step === 'email') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step">
          <div className="auth-logo-icon">💬</div>
          <h1 className="auth-logo">DierCHAT</h1>
          <p className="auth-subtitle">
            Введите email для входа<br/>или создания аккаунта
          </p>
          <form onSubmit={handleEmailSubmit} className="auth-form">
            <div className={`auth-input-wrap ${shake ? 'auth-shake' : ''}`}>
              <input
                type="email"
                className="auth-input"
                placeholder="example@mail.ru"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
            </div>
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || !emailRegex.test(email.trim())}>
              {loading ? <span className="auth-spinner" /> : 'Получить код'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  // --- Code Step ---
  if (step === 'code') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step auth-step--slide-in">
          <button type="button" className="auth-back" onClick={() => setStep('email')}><ArrowLeft size={18} /></button>
          <div className="auth-logo-icon">🔐</div>
          <h1 className="auth-logo">DierCHAT</h1>
          <p className="auth-subtitle">
            Код отправлен на<br/><strong>{email.trim().toLowerCase()}</strong>
          </p>
          <form onSubmit={handleCodeSubmit} className="auth-form">
            <div className="auth-code-inputs" onPaste={handleCodePaste}>
              {code.map((c, i) => (
                <input
                  key={i}
                  ref={el => { codeInputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  className={`auth-code-digit ${shake ? 'auth-shake' : ''}`}
                  value={c}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  maxLength={1}
                  autoComplete="one-time-code"
                />
              ))}
            </div>
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || codeStr.length !== 6}>
              {loading ? <span className="auth-spinner" /> : 'Подтвердить'}
            </button>
            <button type="button" className="auth-link" onClick={handleResend} disabled={resendTimer > 0 || loading}>
              {resendTimer > 0 ? (
                <span className="auth-timer">Повторная отправка через <strong>{resendTimer}</strong> сек</span>
              ) : 'Отправить код повторно'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  // --- Password (2FA) Step ---
  if (step === 'password') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step auth-step--slide-in">
          <button type="button" className="auth-back" onClick={() => { setStep('code'); setTemp2fa(''); }}><ArrowLeft size={18} /></button>
          <div className="auth-logo-icon">🔒</div>
          <h1 className="auth-logo">Облачный пароль</h1>
          <p className="auth-subtitle">Введите пароль двухэтапной аутентификации</p>
          <form onSubmit={handlePasswordSubmit} className="auth-form">
            <input
              type="password"
              className={`auth-input ${shake ? 'auth-shake' : ''}`}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || !password.trim()}>
              {loading ? <span className="auth-spinner" /> : 'Подтвердить'}
            </button>
            <button type="button" className="auth-link" onClick={() => setStep('forgot')}>
              Забыли пароль?
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  // --- Forgot Password Step ---
  if (step === 'forgot') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step auth-step--slide-in">
          <button type="button" className="auth-back" onClick={() => setStep('password')}><ArrowLeft size={18} /></button>
          <div className="auth-logo-icon">🔑</div>
          <h1 className="auth-logo">Восстановление пароля</h1>
          <p className="auth-subtitle">На ваш email будет отправлен код сброса</p>
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <div className={`auth-input-wrap ${shake ? 'auth-shake' : ''}`}>
              <input
                type="email"
                className="auth-input"
                placeholder="example@mail.ru"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || !emailRegex.test(email.trim())}>
              {loading ? <span className="auth-spinner" /> : 'Отправить код'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  // --- Reset Password Step ---
  if (step === 'reset') return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step auth-step--slide-in">
          <button type="button" className="auth-back" onClick={() => setStep('forgot')}><ArrowLeft size={18} /></button>
          <div className="auth-logo-icon">🔑</div>
          <h1 className="auth-logo">Новый пароль</h1>
          <p className="auth-subtitle">Введите код из письма и новый пароль</p>
          <form onSubmit={handleResetSubmit} className="auth-form">
            <div className="auth-code-inputs">
              {code.map((c, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  className="auth-code-digit"
                  value={c}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  maxLength={1}
                />
              ))}
            </div>
            <input type="password" className="auth-input" placeholder="Новый пароль"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <input type="password" className="auth-input" placeholder="Повторите пароль"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || codeStr.length !== 6 || !newPassword.trim()}>
              {loading ? <span className="auth-spinner" /> : 'Сбросить пароль'}
            </button>
            <button type="button" className="auth-link" onClick={handleResend} disabled={resendTimer > 0 || loading}>
              {resendTimer > 0 ? `Повтор через ${resendTimer} сек` : 'Отправить код повторно'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  // --- Profile Step ---
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-step auth-step--slide-in">
          <div className="auth-logo-icon">👤</div>
          <h1 className="auth-logo">Ваш профиль</h1>
          <p className="auth-subtitle">Заполните информацию о себе</p>
          <form onSubmit={handleProfileSubmit} className="auth-form">
            <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <button type="button" className="auth-avatar-btn" onClick={handleAvatarClick}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="auth-avatar-img" />
              ) : (
                <div className="auth-avatar-placeholder">
                  <Camera size={28} />
                  <span>Фото</span>
                </div>
              )}
            </button>
            <div className="auth-name-row">
              <input type="text" className="auth-input" placeholder="Имя" value={firstName}
                onChange={e => setFirstName(e.target.value)} required autoFocus />
              <input type="text" className="auth-input" placeholder="Фамилия" value={lastName}
                onChange={e => setLastName(e.target.value)} />
            </div>
            <input type="text" className="auth-input" placeholder="@имя_пользователя" value={username}
              onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} required />
            {error && <p className="auth-error"><AlertCircle size={14} /> {error}</p>}
            <button type="submit" className="auth-button" disabled={loading || !firstName.trim() || !username.trim()}>
              {loading ? <span className="auth-spinner" /> : 'Начать общение'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

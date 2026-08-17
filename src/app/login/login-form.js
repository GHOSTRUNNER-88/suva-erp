"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useTranslation } from "react-i18next";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { firebaseAuth, googleAuthProvider } from "@/lib/firebase/client";
import { loginAction } from "./actions";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" {...props}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8.1 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4-17.3 10z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5c-2 1.5-4.6 2.4-7.6 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5c3.4 6.7 10.4 11.6 17.8 11.6z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.5 5.5C41.5 36.5 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

function firebaseErrorMessage(t, error) {
  console.error("[login] firebase auth error:", error?.code, error);

  switch (error?.code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t("errWrongCredentials");
    case "auth/invalid-email":
      return t("errInvalidEmail");
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    case "auth/operation-not-allowed":
      return t("errGoogleNotEnabled");
    case "auth/unauthorized-domain":
      return t("errUnauthorizedDomain");
    case "auth/popup-blocked":
      return t("errPopupBlocked");
    default:
      return t("errSignInFailed", { code: error?.code ?? "unknown error" });
  }
}

export default function LoginForm({ companySlug = null }) {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState(null);

  async function completeLogin(idToken) {
    const result = await loginAction({ idToken, companySlug });
    if (result && !result.ok) {
      setFormError(t(result.formError));
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    setFormError(null);

    if (!EMAIL_PATTERN.test(email)) {
      setFormError(t("enterValidEmail"));
      return;
    }
    if (!password) {
      setFormError(t("enterPassword"));
      return;
    }

    startTransition(async () => {
      try {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        await completeLogin(await credential.user.getIdToken());
      } catch (error) {
        // A successful login ends in loginAction() calling redirect(), which
        // Next.js implements by throwing a special signal — that throw
        // propagates up through this same try/catch, so without rethrowing
        // it here it gets misread as a failed Firebase sign-in on every
        // successful login.
        unstable_rethrow(error);
        const message = firebaseErrorMessage(t, error);
        if (message) setFormError(message);
      }
    });
  }

  function onGoogleClick() {
    setFormError(null);

    startTransition(async () => {
      try {
        const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
        await completeLogin(await credential.user.getIdToken());
      } catch (error) {
        unstable_rethrow(error);
        const message = firebaseErrorMessage(t, error);
        if (message) setFormError(message);
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mb-7 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("loginWelcomeTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("loginWelcomeSubtitle")}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            className="h-11 pl-9"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            className="h-11 pr-9 pl-9"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? t("loggingIn") : t("loginButton")}
      </Button>

      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-card px-2">{t("or")}</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={isPending}
        onClick={onGoogleClick}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        {t("continueWithGoogle")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("newToSuva")}{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          {t("createAccount")}
        </Link>
      </p>
      </form>
    </>
  );
}

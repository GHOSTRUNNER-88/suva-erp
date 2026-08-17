"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  Lock,
  Mail,
  User,
  XCircle,
} from "lucide-react";
import { firebaseAuth, googleAuthProvider } from "@/lib/firebase/client";
import { slugify } from "@/lib/company/slugify";
import { signupSchema } from "@/lib/company/signup-schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import SignupProgress from "@/components/signup-progress";
import { loginAction } from "@/app/login/actions";
import {
  checkAccountAvailability,
  checkPanAvailability,
  checkSlugAvailability,
  signupAction,
} from "./actions";

export const PASSWORD_RULES = [
  { key: "length", labelKey: "passwordRuleLength", test: (value) => value.length >= 8 },
  { key: "upper", labelKey: "passwordRuleUpper", test: (value) => /[A-Z]/.test(value) },
  { key: "number", labelKey: "passwordRuleNumber", test: (value) => /[0-9]/.test(value) },
];

export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const stepVariants = {
  enter: (direction) => ({ x: direction > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -32 : 32, opacity: 0 }),
};

export function GoogleIcon(props) {
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

export function firebaseErrorMessage(t, error, context = "sign-in") {
  console.error(`[${context}] firebase auth error:`, error?.code, error);

  switch (error?.code) {
    case "auth/email-already-in-use":
      return t("errAccountExists");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t("errWrongCredentials");
    case "auth/weak-password":
      return t("errWeakPassword");
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

function PasswordRequirements({ password }) {
  const { t } = useTranslation();
  return (
    <motion.ul
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden pt-1"
    >
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.key} className="flex items-center gap-1.5 py-0.5 text-xs">
            {met ? (
              <Check className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Circle className="h-1.5 w-1.5 shrink-0 fill-current text-muted-foreground/60" />
            )}
            <span className={met ? "text-foreground" : "text-muted-foreground"}>{t(rule.labelKey)}</span>
          </li>
        );
      })}
    </motion.ul>
  );
}

function FieldError({ message }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 4 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden text-sm text-destructive"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function AvailabilityStatus({ status }) {
  if (status === "checking") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (status === "available") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />;
  }
  if (status === "taken") {
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  }
  return null;
}

function IconField({ icon: Icon, className = "", ...props }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={`h-11 pl-9 ${className}`} {...props} />
    </div>
  );
}

export default function SignupForm() {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleIdToken, setGoogleIdToken] = useState(null);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [credentialErrors, setCredentialErrors] = useState({});
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [slugStatus, setSlugStatus] = useState("idle");
  const [panStatus, setPanStatus] = useState("idle");

  const passwordValid = PASSWORD_RULES.every((rule) => rule.test(password));
  const emailError = emailTouched && email && !EMAIL_PATTERN.test(email) ? t("enterValidEmail") : null;
  const usingGoogle = Boolean(googleIdToken);
  const STEP_CONTENT = {
    1: { title: t("step1Title"), subtitle: t("step1Subtitle") },
    2: { title: t("step2Title"), subtitle: t("step2Subtitle") },
  };

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    trigger,
    getValues,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    mode: "onChange",
    defaultValues: {
      ownerFirstName: "",
      ownerLastName: "",
      companyName: "",
      slug: "",
      panNumber: "",
    },
  });

  const slugValue = useWatch({ control, name: "slug" });
  const panValue = useWatch({ control, name: "panNumber" });

  useEffect(() => {
    if (!slugValue || !/^[a-z0-9-]{2,60}$/.test(slugValue)) {
      return;
    }
    const timeout = setTimeout(async () => {
      const available = await checkSlugAvailability(slugValue);
      setSlugStatus(available ? "available" : "taken");
    }, 450);
    return () => clearTimeout(timeout);
  }, [slugValue]);

  useEffect(() => {
    if (!panValue || !/^\d{9}$/.test(panValue)) {
      return;
    }
    const timeout = setTimeout(async () => {
      const available = await checkPanAvailability(panValue);
      setPanStatus(available ? "available" : "taken");
    }, 450);
    return () => clearTimeout(timeout);
  }, [panValue]);

  async function goToCompanyStep() {
    setFormError(null);
    setEmailTouched(true);

    const personalValid = await trigger(["ownerFirstName", "ownerLastName"]);
    const nextErrors = {};
    if (!usingGoogle && !EMAIL_PATTERN.test(email)) nextErrors.email = t("enterValidEmail");
    if (!usingGoogle && !passwordValid) {
      nextErrors.password = t("errWeakPassword");
    }
    if (!termsAccepted) nextErrors.terms = t("termsRequired");

    setCredentialErrors(nextErrors);
    if (!personalValid || Object.keys(nextErrors).length) return;

    setDirection(1);
    setStep(2);
  }

  function goToPersonalStep() {
    setDirection(-1);
    setStep(1);
  }

  async function finishSignup(idToken) {
    const result = await signupAction({ ...getValues(), idToken });
    if (result && !result.ok) {
      if (result.formError) setFormError(t(result.formError));
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field, { message: t(messages[0], { value: getValues()[field] }) });
      }
    }
  }

  const onSubmit = () => {
    setFormError(null);

    if (displayedSlugStatus === "taken") {
      setError("slug", { message: t("slugTaken", { value: slugValue }) });
      return;
    }
    if (displayedPanStatus === "taken") {
      setError("panNumber", { message: t("panTaken") });
      return;
    }

    startTransition(async () => {
      try {
        const idToken = googleIdToken
          ? googleIdToken
          : await (await createUserWithEmailAndPassword(firebaseAuth, email, password)).user.getIdToken();
        await finishSignup(idToken);
      } catch (error) {
        // A successful signup ends in signupAction() calling redirect(),
        // which throws internally — without rethrowing it here it gets
        // misread as a failed Firebase sign-in on every successful signup.
        unstable_rethrow(error);
        const message = firebaseErrorMessage(t, error, "signup");
        if (message) setFormError(message);
      }
    });
  };

  const onGoogleClick = () => {
    setFormError(null);

    startTransition(async () => {
      try {
        const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
        const idToken = await credential.user.getIdToken();

        // This Google account may already own a Company from an earlier
        // signup — if so, log them straight in instead of pretending a
        // second signup is possible (they'd just hit ACCOUNT_ALREADY_REGISTERED
        // at final submit otherwise, after filling in the whole form).
        const available = await checkAccountAvailability(credential.user.uid);
        if (!available) {
          const result = await loginAction({ idToken, companySlug: null });
          if (result && !result.ok) {
            setFormError(t(result.formError));
          }
          return;
        }

        setGoogleIdToken(idToken);
        setGoogleEmail(credential.user.email);
        if (credential.user.displayName) {
          const [firstName, ...rest] = credential.user.displayName.trim().split(/\s+/);
          setValue("ownerFirstName", firstName ?? "", { shouldValidate: true });
          setValue("ownerLastName", rest.join(" "), { shouldValidate: true });
        }
        setCredentialErrors((prev) => ({ ...prev, email: undefined, password: undefined }));
      } catch (error) {
        unstable_rethrow(error);
        const message = firebaseErrorMessage(t, error, "signup");
        if (message) setFormError(message);
      }
    });
  };

  const displayedSlugStatus =
    slugValue && /^[a-z0-9-]{2,60}$/.test(slugValue) ? slugStatus : "idle";
  const displayedPanStatus = panValue && /^\d{9}$/.test(panValue) ? panStatus : "idle";

  return (
    <>
      <SignupProgress active={isPending} />

      <div>
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          {[1, 2].map((currentStep) => (
            <div
              key={currentStep}
              className={`h-1.5 rounded-full transition-colors ${
                currentStep <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="mb-3 text-xs font-medium text-muted-foreground">{t("stepOf", { step })}</p>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`heading-${step}`}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25 }}
            className="mb-4 space-y-0.5"
          >
            <h1 className="text-xl font-bold tracking-tight">{STEP_CONTENT[step].title}</h1>
            <p className="text-sm text-muted-foreground">{STEP_CONTENT[step].subtitle}</p>
          </motion.div>
        </AnimatePresence>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <AnimatePresence initial={false}>
            {formError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" custom={direction}>
            {step === 1 ? (
              <motion.div
                key="personal"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="ownerFirstName">{t("firstName")}</Label>
                    <IconField
                      icon={User}
                      id="ownerFirstName"
                      autoFocus
                      placeholder="Priyanshu"
                      {...register("ownerFirstName")}
                    />
                    <FieldError message={errors.ownerFirstName?.message} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ownerLastName">{t("lastName")}</Label>
                    <Input
                      id="ownerLastName"
                      className="h-11"
                      placeholder="Begwani"
                      {...register("ownerLastName")}
                    />
                  </div>
                </div>

                <div className={usingGoogle ? "" : "grid gap-3 md:grid-cols-2"}>
                  <div className="space-y-1">
                    <Label htmlFor="email">{t("email")}</Label>
                    <IconField
                      icon={Mail}
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={googleEmail ?? email}
                      onChange={(event) => {
                        setGoogleIdToken(null);
                        setGoogleEmail(null);
                        setEmail(event.target.value);
                      }}
                      onBlur={() => setEmailTouched(true)}
                      disabled={usingGoogle}
                    />
                    <FieldError message={credentialErrors.email ?? emailError} />
                  </div>

                  {!usingGoogle && (
                    <div className="space-y-1">
                      <Label htmlFor="password">{t("password")}</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          className="h-11 pr-9 pl-9"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onFocus={() => setPasswordFocused(true)}
                          onBlur={() => setPasswordFocused(false)}
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
                      <AnimatePresence initial={false}>
                        {(passwordFocused || password.length > 0) && !passwordValid && (
                          <PasswordRequirements password={password} />
                        )}
                      </AnimatePresence>
                      <FieldError message={credentialErrors.password} />
                    </div>
                  )}
                </div>

                {usingGoogle && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm">
                    {t("googleConnectedAs")} <span className="font-medium">{googleEmail}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => {
                        setTermsAccepted(checked === true);
                        if (checked) setCredentialErrors((prev) => ({ ...prev, terms: undefined }));
                      }}
                    />
                    <Label
                      htmlFor="terms"
                      className="text-sm leading-snug font-normal text-muted-foreground"
                    >
                      {t("termsAgree")}
                    </Label>
                  </div>
                  <FieldError message={credentialErrors.terms} />
                </div>

                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button type="button" className="h-11 w-full" onClick={goToCompanyStep}>
                    {t("continue")}
                  </Button>
                </motion.div>

                <div className="relative py-0.5 text-center text-xs text-muted-foreground">
                  <span className="relative z-10 bg-card px-2">{t("or")}</span>
                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                </div>

                <motion.div whileTap={{ scale: 0.98 }}>
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
                </motion.div>

                <p className="text-center text-sm text-muted-foreground">
                  {t("alreadyUser")}{" "}
                  <Link href="/login" className="font-medium text-primary hover:underline">
                    {t("loginButton")}
                  </Link>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="company"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <button
                  type="button"
                  onClick={goToPersonalStep}
                  className="-mt-2 mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("back")}
                </button>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="companyName">{t("companyName")}</Label>
                    <IconField
                      icon={Building2}
                      id="companyName"
                      autoFocus
                      placeholder="Suvacorp Traders"
                      {...register("companyName", {
                        onChange: (event) => {
                          if (!slugEdited) {
                            setValue("slug", slugify(event.target.value), { shouldValidate: true });
                            setSlugStatus("checking");
                          }
                        },
                      })}
                    />
                    <FieldError message={errors.companyName?.message} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="panNumber">{t("panNumber")}</Label>
                    <div className="relative">
                      <Hash className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="panNumber"
                        inputMode="numeric"
                        maxLength={9}
                        placeholder="123456789"
                        className="h-11 pr-9 pl-9"
                        {...register("panNumber", {
                          onChange: (event) => {
                            const cleaned = event.target.value.replace(/\D/g, "").slice(0, 9);
                            if (cleaned !== event.target.value) {
                              setValue("panNumber", cleaned, { shouldValidate: true });
                            }
                            setPanStatus(/^\d{9}$/.test(cleaned) ? "checking" : "idle");
                          },
                        })}
                      />
                      <div className="absolute top-1/2 right-3 -translate-y-1/2">
                        <AvailabilityStatus status={displayedPanStatus} />
                      </div>
                    </div>
                    <FieldError message={errors.panNumber?.message} />
                    <AnimatePresence initial={false}>
                      {!errors.panNumber && displayedPanStatus === "taken" && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden text-sm text-destructive"
                        >
                          {t("panTaken")}
                        </motion.p>
                      )}
                      {!errors.panNumber && displayedPanStatus === "available" && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden text-sm text-green-600 dark:text-green-500"
                        >
                          {t("panAvailable")}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="slug">{t("yourUrl")}</Label>
                  <div className="flex h-11 items-center gap-1 rounded-xl border border-transparent bg-muted/60 pr-2.5 pl-4 transition-colors hover:bg-muted focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
                    <span className="shrink-0 text-sm text-muted-foreground">localhost:3000/</span>
                    <Input
                      id="slug"
                      placeholder="suvacorp-traders"
                      className="h-full flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                      {...register("slug", {
                        onChange: (event) => {
                          setSlugEdited(true);
                          const cleaned = slugify(event.target.value);
                          if (cleaned !== event.target.value) {
                            setValue("slug", cleaned, { shouldValidate: true });
                          }
                          setSlugStatus(/^[a-z0-9-]{2,60}$/.test(cleaned) ? "checking" : "idle");
                        },
                      })}
                    />
                    <AvailabilityStatus status={displayedSlugStatus} />
                  </div>
                  <FieldError message={errors.slug?.message} />
                  <AnimatePresence initial={false}>
                    {!errors.slug && displayedSlugStatus === "taken" && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden text-sm text-destructive"
                      >
                        {t("slugTaken", { value: slugValue })}
                      </motion.p>
                    )}
                    {!errors.slug && displayedSlugStatus === "available" && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden text-sm text-green-600 dark:text-green-500"
                      >
                        {t("slugAvailable", { value: slugValue })}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button type="submit" className="h-11 w-full" disabled={isPending}>
                    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isPending ? t("creatingCompany") : t("createCompany")}
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </>
  );
}

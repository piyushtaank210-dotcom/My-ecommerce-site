"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AtSign,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { sendContactMessageAction, type ContactState } from "@/lib/actions";
import { STORE } from "@/lib/store-info";

const SUBJECTS = [
  { value: "product", label: "A product I am considering" },
  { value: "order", label: "An order I have placed" },
  { value: "support", label: "Setting something up" },
  { value: "returns", label: "A return, replacement or warranty" },
  { value: "other", label: "Something else" },
];

/**
 * The questions customers actually ask.
 *
 * They are written in the shop's own voice and they are the questions
 * the team is asked most — a first console, a late delivery, a fault, a
 * return, an address. The form writes one of them out above the message
 * box, so that somebody who is not sure what to write can see what is
 * answerable, and take one as a starting point.
 */
const QUESTIONS = [
  "Which console should I get for a first setup?",
  "My order was placed five days ago and is late.",
  "The controller I received will not turn on.",
  "I need to return a console that arrived damaged.",
  "Can I change the delivery address on my order?",
];

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessageAction, initial);
  const [sent, setSent] = useState(false);
  // Every field is held here rather than left to the browser.
  //
  // React empties an uncontrolled form when the action it was given
  // finishes, so a message that was one character short of long enough
  // used to take the customer's name, email, phone and order ID with
  // it. Held in state, they are put back where they were.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState("product");
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const errors = state.errors ?? {};

  // `state` gets a new identity on every completed submission, so this
  // tracks the latest result rather than the first one.
  useEffect(() => {
    setSent(state.ok);
  }, [state]);

  // The question is only written out while the box is empty and
  // untouched. Once somebody starts writing, their own words take over.
  const characters = message.trim().length;
  const typing = useTypewriter(QUESTIONS, characters === 0 && !focused);

  const tooShort = characters > 0 && characters < 10;

  // A question taken from the panel starts the message, so somebody
  // never has to write a first sentence from nothing.
  const takeQuestion = () => {
    setMessage(QUESTIONS[typing.index % QUESTIONS.length]);
    box.current?.focus();
  };

  if (sent) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-b from-green-50/80 to-white p-5 sm:p-6">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-green-500 to-brand" />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-700 ring-4 ring-green-50">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-[17px] font-bold text-ink">Message received</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-600">
          {state.message}
        </p>

        <dl className="mt-5 space-y-2.5 border-t border-green-200/70 pt-4 text-[12.5px] text-gray-600">
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 font-semibold text-ink">Next</dt>
            <dd>A person reads it, usually within one working day.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 font-semibold text-ink">Where</dt>
            <dd>Your message is in our enquiry queue, in the order it arrived.</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => {
            // A second message is a new message: the box is emptied and
            // the question starts again.
            setSent(false);
            setMessage("");
            setFocused(false);
          }}
          className="btn btn-outline btn-sm mt-5"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your name"
          name="name"
          value={name}
          onChange={setName}
          placeholder="Write your name"
          error={errors.name}
          autoComplete="name"
          icon={<User className="h-4 w-4" />}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@email.com"
          error={errors.email}
          autoComplete="email"
          icon={<AtSign className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          placeholder="+91 98765 43210"
          error={errors.phone}
          autoComplete="tel"
          hint="Optional — it is the quickest way to reach you."
          icon={<Phone className="h-4 w-4" />}
        />
        <Field
          label="Order ID"
          name="orderId"
          value={orderId}
          onChange={setOrderId}
          placeholder="PFJTTPT7"
          error={errors.orderId}
          hint="Optional — it is in your order confirmation."
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <div>
        <label htmlFor="subject" className="label">
          What is this about?
        </label>
        <div className="relative">
          <MessageCircle
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <select
            id="subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`input h-[46px] cursor-pointer pl-9 pr-10 ${
              errors.subject ? "input-error" : ""
            }`}
          >
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {errors.subject && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.subject}</p>
        )}
      </div>

      {/* The question writes itself.
          It is the one moving thing on the page, and it is a real
          question rather than a flourish — somebody who is staring at an
          empty box can see what is answerable and start from it. */}
      <div className="relative overflow-hidden rounded-xl border border-brand/15 bg-brand-tint/70 p-4">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand/10 blur-2xl"
        />

        <div className="relative flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand/85">
            A question we get asked
          </span>
        </div>

        {/* The box keeps two lines of height on a phone, where a question
            wraps, and one line everywhere else — so the panel does not
            jump about as the questions change. */}
        <p className="relative mt-2.5 min-h-[3.1rem] text-[15px] font-medium leading-[1.6] text-ink min-[440px]:min-h-[1.75rem]">
          {typing.text}
          {typing.running && (
            <span
              aria-hidden="true"
              className="caret-blink ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.16em] bg-brand align-middle"
            />
          )}
        </p>

        <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-brand/10 pt-3">
          <div className="flex items-center gap-1.5">
            {QUESTIONS.map((q, i) => (
              <span
                key={q}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === typing.index ? "w-5 bg-brand" : "w-1.5 bg-brand/25"
                }`}
              />
            ))}
          </div>
          {/* Once somebody has written their own message the panel is
              only a reference — the button would overwrite their words. */}
          {characters === 0 && (
            <button
              type="button"
              onClick={takeQuestion}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:border-brand hover:bg-white"
            >
              Use this question
              <CornerDownLeft className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="message" className="label">
            Your message
          </label>
          {characters > 0 && (
            <span
              className={`text-[11.5px] tabular-nums ${
                tooShort ? "text-amber-600" : "text-gray-400"
              }`}
            >
              {characters} {characters === 1 ? "character" : "characters"}
            </span>
          )}
        </div>
        <textarea
          id="message"
          name="message"
          rows={5}
          ref={box}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Tell us what you need — the product, the order, or the problem."
          aria-invalid={Boolean(errors.message)}
          className={`input resize-none ${errors.message ? "input-error" : ""}`}
        />
        {errors.message ? (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.message}</p>
        ) : (
          <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
            {tooShort
              ? "A little more, so we can help properly."
              : "The more you tell us, the less we have to ask you back."}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-lg btn-brand group relative w-full overflow-hidden"
      >
        {/* A sheen that crosses the button when it is hovered. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        <span className="relative z-10 flex items-center justify-center gap-2">
          <SubmitLabel />
        </span>
      </button>

      {/* What actually happens to the message — which is what a person
          buying a console is really asking when they see this form. */}
      <div className="space-y-3 border-t border-gray-200 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
            <Clock className="h-4 w-4" />
          </span>
          <p className="text-[12.5px] leading-relaxed text-gray-600">
            A person reads every message, usually within one working day.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <p className="text-[12.5px] leading-relaxed text-gray-600">
            Your details stay with us. We do not pass them on — read the{" "}
            <Link
              href="/privacy-policy"
              className="whitespace-nowrap font-medium text-brand hover:underline"
            >
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </form>
  );
}

/**
 * Whether the shop is at its desk right now.
 *
 * The hours are the shop's own, kept in its own time zone, so the dot
 * says the same thing for everybody who opens the page. It is worked
 * out after the page has loaded, so the server's markup and the first
 * client render agree.
 */
export function SupportStatus() {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      // IST is UTC+5:30 and has no daylight saving, so the shop's clock
      // is the UTC clock shifted by a fixed half hour. The shift is
      // read back in UTC, so the visitor's own time zone is irrelevant.
      const ist = new Date(now.getTime() + 330 * 60000);
      const day = ist.getUTCDay();
      const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const working = day >= 1 && day <= 6;
      const inHours =
        minutes >= STORE.openHour * 60 && minutes < STORE.closeHour * 60;
      setOpen(working && inHours);
    };

    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  const label =
    open === null
      ? STORE.hoursShort
      : open
        ? `Open now · ${STORE.hoursShort}`
        : "Closed now · we reply next working day";

  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-500">
      <span className="relative flex h-2 w-2">
        {open && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            open === null
              ? "bg-gray-300"
              : open
                ? "bg-emerald-500"
                : "bg-amber-400"
          }`}
        />
      </span>
      {label}
    </span>
  );
}

function SubmitLabel() {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        Sending…
      </>
    );
  }
  return (
    <>
      <Send className="h-4 w-4" />
      Send message
    </>
  );
}

/**
 * Writes the questions out one letter at a time.
 *
 * It stops the moment the box is touched — somebody's own words are
 * never overwritten — and it does not run at all for a visitor who has
 * asked their system for less movement.
 */
function useTypewriter(
  questions: string[],
  enabled: boolean
): { text: string; index: number; running: boolean } {
  const [state, setState] = useState({ text: "", index: 0 });
  const reduced = usePrefersReducedMotion();
  // Which question is being written, and how much of it. Both are kept
  // outside the state, so that the sentence can be finished when the
  // animation stops and carried on when it starts again — rather than
  // being typed out from the beginning every time.
  const at = useRef(0);
  const letter = useRef(0);
  const erasing = useRef(false);

  useEffect(() => {
    if (reduced) {
      if (enabled) setState({ text: questions[0] ?? "", index: 0 });
      return;
    }

    if (!enabled) {
      // Somebody is writing their own message. The question stops where
      // it is — finished, rather than half typed — and picks up from
      // there when the box is left.
      const index = at.current % questions.length;
      letter.current = questions[index].length;
      erasing.current = false;
      setState({ text: questions[index], index });
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const question = questions[at.current % questions.length];

      if (!erasing.current) {
        letter.current += 1;
        setState({
          text: question.slice(0, letter.current),
          index: at.current,
        });
        if (letter.current >= question.length) {
          erasing.current = true;
          timer = setTimeout(tick, 2400);
          return;
        }
        // A beat at a full stop, so it reads like a person writing
        // rather than a machine filling a field.
        const pause = /[.,?]/.test(question[letter.current - 1]) ? 220 : 0;
        timer = setTimeout(tick, 32 + pause);
        return;
      }

      letter.current -= 1;
      setState({
        text: question.slice(0, letter.current),
        index: at.current,
      });
      if (letter.current <= 0) {
        erasing.current = false;
        at.current += 1;
        timer = setTimeout(tick, 380);
        return;
      }
      timer = setTimeout(tick, 14);
    };

    timer = setTimeout(tick, 420);
    return () => clearTimeout(timer);
  }, [enabled, reduced, questions]);

  return { ...state, running: enabled && !reduced };
}

/**
 * Whether the visitor has asked their system for less movement.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoComplete,
  hint,
  icon,
}: {
  label: string;
  name: string;
  /** What is in the field. Held by the form, so it survives a failed send. */
  value: string;
  /** Called with what has just been typed. */
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  /** A line under the field that says what it is for. */
  hint?: string;
  /** A mark shown inside the field, on the left. */
  icon?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <div className="group relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand"
          >
            {icon}
          </span>
        )}
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={`input h-[46px] transition-colors hover:border-gray-400 focus:hover:border-brand ${
            error ? "input-error" : ""
          } ${icon ? "pl-9" : ""}`}
        />
      </div>
      {error ? (
        <p className="mt-1 text-[12.5px] text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

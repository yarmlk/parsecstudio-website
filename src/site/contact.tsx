import { useId, useLayoutEffect, useRef, useState, type FormEvent, memo } from "react";
import { CONTACT } from "../lib/facts";
import { Icon } from "../ui/Icons";

/* 06 contact: the form, one frosted plate over the Horizon light. A note is sent to our inbox (info@) through
   FormSubmit; if that fails, the visitor is offered the same note ready in their own mail app, so it is never lost. */

type Key = "name" | "email";
type Errors = Partial<Record<Key, string>>;
type Sent = { first: string; h: number };

/** the form service that mails each note to our inbox (the first note sent asks info@ once to confirm the form) */
const FORM_URL = `https://formsubmit.co/ajax/${CONTACT.email}`;

async function deliver(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim();
  const r = await fetch(FORM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: v("name"), email: v("email"), company: v("company") || "—", message: v("msg") || "—",
      _subject: `Website: ${v("company") ? `${v("name")}, ${v("company")}` : v("name")}`,
      _replyto: v("email"), _template: "table", _captcha: "false",
    }),
  });
  const j = await r.json().catch(() => null) as { success?: string | boolean } | null;
  if (!r.ok || !j || String(j.success) !== "true") throw new Error("not sent");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function check(f: FormData): Errors {
  const e: Errors = {};
  const name = String(f.get("name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim();
  if (!name) e.name = "Your name, please";
  if (!email) e.email = "Your email, please";
  else if (!EMAIL.test(email)) e.email = "Check the address";
  return e;
}

/** the same note, ready in the visitor's own mail app */
function mailto(f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim();
  const from = v("company") ? `${v("name")}, ${v("company")}` : v("name");
  const body = [v("msg"), `${from}\n${v("email")}`].filter(Boolean).join("\n\n");
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(`Project: ${from}`)}&body=${encodeURIComponent(body)}`;
}

function Field({ name, label, type = "text", auto, required, optional, error, area, onEdit }: {
  name: string; label: string; type?: string; auto?: string; required?: boolean; optional?: boolean; error?: string; area?: boolean; onEdit?: () => void;
}) {
  const id = useId();
  const err = `${id}-err`;
  const own = {
    id, name, autoComplete: auto, onInput: onEdit, spellCheck: area ? true : false,
    "aria-invalid": error ? true : undefined, "aria-describedby": error ? err : undefined, "aria-required": required || undefined,
  };
  return (
    <div className={`st-cf__field${area ? " st-cf__field--area" : ""}${error ? " is-bad" : ""}`}>
      {area ? <textarea {...own} rows={4} /> : <input {...own} type={type} inputMode={type === "email" ? "email" : undefined} />}
      <div className="st-cf__top">
        <label className="st-cf__l" htmlFor={id}>{label}{optional && <span className="st-cf__opt">Optional</span>}</label>
        {error && <span className="st-cf__err" id={err}>{error}</span>}
      </div>
    </div>
  );
}

function ContactFormBase() {
  const plate = useRef<HTMLDivElement | null>(null);
  const thanks = useRef<HTMLHeadingElement | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState<Sent | null>(null);
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  /** the note could not be sent: the same note, ready in the visitor's mail app */
  const [fail, setFail] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const bad = check(f);
    setErrors(bad);
    const first = (Object.keys(bad) as Key[])[0];
    if (first) { form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    if (busy) return;
    const name = String(f.get("name")).trim();
    /* desk: the plate keeps its size; the phone lets it close up around the thank-you */
    const keep = plate.current && !plate.current.closest(".st-site--mob") ? plate.current.offsetHeight : 0;
    /* a bot fills the hidden field: it is thanked and nothing is sent */
    if (String(f.get("website") ?? "")) { setSent({ first: name.split(/\s+/)[0], h: keep }); return; }
    setBusy(true); setFail(null);
    try {
      await deliver(f);
      setSent({ first: name.split(/\s+/)[0], h: keep });
    } catch {
      setFail(mailto(f));
    } finally {
      setBusy(false);
    }
  };
  const clear = (k: Key) => () => setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));

  /* the thank-you takes the focus (and is read out); "New message" brings it back to the first field */
  useLayoutEffect(() => {
    if (sent) {
      const h = thanks.current;
      h?.focus({ preventScroll: true });
      /* only if the thank-you is out of sight (the phone): bring it to the middle, clear of the nav */
      const sc = h?.closest<HTMLElement>(".st-site__scroll");
      if (h && sc) {
        const r = h.getBoundingClientRect(), v = sc.getBoundingClientRect();
        if (r.top < v.top + 110 || r.bottom > v.bottom - 20) h.scrollIntoView({ block: "center" });
      }
    } else if (again) {
      plate.current?.querySelector<HTMLElement>('[name="name"]')?.focus({ preventScroll: true });
    }
  }, [sent, again]);

  return (
    <div ref={plate} className={`st-cf${sent ? " is-sent" : ""}`} style={sent?.h ? { minHeight: sent.h } : undefined}>
      {sent ? (
        <div className="st-cf__sent">
          <div className="st-cf__msg">
            <h3 ref={thanks} className="st-cf__thanks" tabIndex={-1}>Thank you, {sent.first}.</h3>
            <p className="st-cf__line">We’ll reply from <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.</p>
          </div>
          <div className="st-cf__note">
            <span className="st-cf__mock">Message sent</span>
            <div className="st-cf__links">
              <button type="button" className="st-cf__link" onClick={() => { setAgain(true); setErrors({}); setSent(null); }}>New message</button>
            </div>
          </div>
        </div>
      ) : (
        <form className="st-cf__form" onSubmit={onSubmit} noValidate aria-label="Write to Parsec Studio">
          <div className="st-cf__grid">
            <Field name="name" label="Name" auto="name" required error={errors.name} onEdit={clear("name")} />
            <Field name="email" label="Email" type="email" auto="email" required error={errors.email} onEdit={clear("email")} />
            <Field name="company" label="Company" auto="organization" optional />
            <Field name="msg" label="Message" area />
          </div>
          {/* left empty by people (hidden); a bot fills it */}
          <input className="st-cf__hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden />
          <div className="st-cf__acts">
            <button type="submit" className="st-pill st-pill--paper st-pill--lg st-cf__send" disabled={busy} aria-busy={busy || undefined}>{busy ? "Sending…" : "Send message"}<Icon name="arrow-right" size={16} /></button>
            {fail
              ? <p className="st-cf__alt st-cf__fail" role="alert">It didn’t go through. <a href={fail}>Send it by email</a></p>
              : <p className="st-cf__alt">or write to <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>}
          </div>
        </form>
      )}
    </div>
  );
}

/** re-rendered only when its own props change (the services hover re-renders the page around it) */
export const ContactForm = memo(ContactFormBase);

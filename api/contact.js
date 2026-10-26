import { waitUntil } from "@vercel/functions";

/* The contact form's note, sent on from our server: the visitor is answered at once and the note goes on to our inbox
   (info@, through FormSubmit's key for it) in the background, however long the form service takes to answer. */

const FORM_URL = "https://formsubmit.co/ajax/8adc7b1a3c7fbd37d9b484be18eec5fe";
const SITE = "https://parsecstudio-website.vercel.app/";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export async function POST(request) {
  let d;
  try { d = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const name = clip(d.name, 200), email = clip(d.email, 200), company = clip(d.company, 200), message = clip(d.message, 5000);
  // a bot fills the hidden field: it is answered like anyone else and nothing is sent
  if (clip(d.website, 200)) return Response.json({ ok: true }, { status: 202 });
  if (!name || !EMAIL.test(email)) return Response.json({ ok: false }, { status: 400 });

  const from = company ? `${name}, ${company}` : name;
  waitUntil(
    fetch(FORM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: SITE.slice(0, -1), Referer: SITE },
      body: JSON.stringify({
        // each line in the mail is the key as written here, so they read as a person would put them
        Name: name, Email: email, Company: company || "—", Message: message || "—",
        _subject: `Website: ${from}`, _replyto: email, _template: "box", _captcha: "false",
      }),
    })
      .then(async (r) => { const t = await r.text(); if (!r.ok || !t.includes('"true"')) console.error("contact: not sent", r.status, t.slice(0, 300)); })
      .catch((e) => console.error("contact: not sent", e)),
  );
  return Response.json({ ok: true }, { status: 202 });
}

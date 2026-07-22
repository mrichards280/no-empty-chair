import React, { useState } from "react";

// Contact section island. Posts to the `contact` Netlify function.
// Rendered on the homepage as <ContactSection contact={content.contact} client:visible />.
export default function ContactSection({ contact }) {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setStatus("Sending…");
    try {
      const res = await fetch("/.netlify/functions/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setStatus("Thank you. I'll be in touch soon.");
      setForm({ name: "", email: "", message: "" });
    } catch {
      setStatus("Something went wrong. Please email me directly.");
    }
  };

  return (
    <section id="contact" className="cta">
      <div className="wrap">
        <div className="kicker">{contact.kicker}</div>
        <h2>{contact.title}</h2>
        <p>{contact.sub}</p>
        <a href="/teardown" className="btn">
          {contact.teardownCtaLabel || "Book my $200 teardown"}
        </a>
        <p style={{ marginTop: 24, fontSize: 14 }}>
          Or DM <a href={contact.ig} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rose-deep)", fontWeight: 600 }}>{contact.igLabel}</a> on Instagram
        </p>

        <form className="cform" onSubmit={submit}>
          <div style={{ fontFamily: "Marcellus, serif", fontSize: 20, color: "var(--plum)", textAlign: "center" }}>{contact.formHeading}</div>
          <input required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="email" placeholder="Your email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <textarea required placeholder="Tell me about your salon" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <button className="btn" type="submit" style={{ justifySelf: "center" }}>{contact.formButton}</button>
          {status ? <div className="status">{status}</div> : null}
        </form>
      </div>
    </section>
  );
}

import React, { useState } from "react";
import { useContent } from "../hooks/useContent";
import RadarModal from "./RadarModal";

// The filled-chair brand mark. stroke uses currentColor unless overridden.
export function ChairMark({ size = 58, orb = "#a85a76", stroke = "#413645" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="No Empty Chair mark">
      <g fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M45 40 L21 40 L21 20 Q21 15 26 15" />
        <path d="M44 40 L46 55" />
        <path d="M22 40 L20 55" />
      </g>
      <circle cx="31" cy="29" r="8.5" fill={orb} />
    </svg>
  );
}

// Build a prefilled booking email (mailto) for a given service or session.
export function bookingHref(email, service) {
  const subject = `Booking inquiry: ${service}`;
  const body =
    `Hi Makayla,\n\nI'd like to book ${service} for my salon.\n\n` +
    `Name:\nSalon / Instagram:\nBest way to reach me:\n\nThanks!`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function Site() {
  const { content, loading, error } = useContent();

  if (loading) return <div className="loading">Loading…</div>;
  if (error || !content)
    return <div className="loading">Couldn't load content. {error}</div>;

  const c = content;

  return (
    <>
      <nav>
        <div className="wrap">
          <div className="logo">
            {c.brand.name} <span>{c.brand.nameAccent}</span>
          </div>
          <ul>
            <li className="hasmenu">
              <a href="#services" className="menutop">Services <span className="caret" aria-hidden="true">▾</span></a>
              <ul className="submenu">
                <li><a href="#services">Full Packages</a></li>
                <li><a href="#consults">Consulting Only</a></li>
                <li><a href="#alacarte">Individual Offerings</a></li>
              </ul>
            </li>
            <li><a href="#proof">Results</a></li>
            <li><a href="#demos">Demos</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#faq">FAQ</a></li>
            <li className="cta"><a href="#contact" className="navbtn">Book a call</a></li>
          </ul>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <div className="wrap">
          <div className="glasscore">
            <div className="chairmark"><ChairMark size={58} /></div>
            <div className="eyebrow">{c.hero.eyebrow}</div>
            <h1>
              {c.hero.title}
              <br />
              <em>{c.hero.titleEm}</em>
            </h1>
            <p className="sub">{c.hero.sub}</p>
            <div className="actions">
              <a href={c.hero.primaryCtaHref} className="btn">{c.hero.primaryCtaLabel}</a>
              <a href={c.hero.secondaryCtaHref} className="btn ghost">{c.hero.secondaryCtaLabel}</a>
            </div>
          </div>
        </div>
      </header>

      <div className="strip">
        {c.strip.text}<b>{c.strip.bold}</b>{c.strip.tail}
      </div>

      {/* PROBLEM / PROMISE */}
      <section id="why">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{c.gap.kicker}</div>
            <h2>{c.gap.title}</h2>
            <p>{c.gap.intro}</p>
          </div>
          <div className="split">
            <div className="col now">
              <h3>{c.gap.nowTitle}</h3>
              <ul>{c.gap.now.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div className="col after glass">
              <h3>{c.gap.afterTitle}</h3>
              <ul>{c.gap.after.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* PACKAGES */}
      <section id="services">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{c.packages.kicker}</div>
            <h2>{c.packages.title}</h2>
            <p>{c.packages.intro}</p>
          </div>
          <div className="svc">
            {c.packages.items.map((p, i) => (
              <div className={"card glass" + (p.featured ? " feat" : "")} key={i}>
                {p.tag ? <span className="tag">{p.tag}</span> : null}
                <h3>{p.name}</h3>
                <div className="from">{p.from}</div>
                <ul>{p.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                <a className="btn" style={{ marginTop: 18, display: "block", textAlign: "center" }} href={bookingHref(c.contact.bookingEmail, p.name)}>Book {p.name}</a>
              </div>
            ))}
          </div>
          <div className="retainer-note"><b>{c.packages.retainerNote}</b></div>
        </div>
      </section>

      {/* CONSULTS */}
      <section id="consults">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{c.consults.kicker}</div>
            <h2>{c.consults.title}</h2>
            <p>{c.consults.intro}</p>
          </div>
          <div className="svc">
            {c.consults.items.map((p, i) => (
              <div className="card glass" key={i}>
                <h3>{p.name}</h3>
                <div className="from">{p.from}</div>
                <ul>{p.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                <a className="btn" style={{ marginTop: 18, display: "block", textAlign: "center" }} href={bookingHref(c.contact.bookingEmail, p.name)}>Book the {p.name}</a>
              </div>
            ))}
          </div>
          <div className="retainer-note"><b>{c.consults.intensiveNote}</b></div>
          {c.consults.addonNote ? (
            <div className="addon-note">{c.consults.addonNote}</div>
          ) : null}
        </div>
      </section>

      {/* À LA CARTE */}
      {c.alacarte ? (
        <section id="alacarte">
          <div className="wrap">
            <div className="sec-head">
              <div className="kicker">{c.alacarte.kicker}</div>
              <h2>{c.alacarte.title}</h2>
              <p>{c.alacarte.intro}</p>
            </div>
            <div className="ala">
              {c.alacarte.items.map((a, i) => (
                <div className="ala-item glass" key={i}>
                  <h3>{a.name}</h3>
                  <p>{a.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 30 }}>
              <a href={c.alacarte.ctaHref} className="btn">{c.alacarte.ctaLabel}</a>
            </div>
          </div>
        </section>
      ) : null}

      {/* RESULTS + WORK (merged) */}
      <section id="proof">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{c.proof.kicker}</div>
            <h2>{c.proof.title}</h2>
            <p>{c.proof.intro}</p>
          </div>
          <div className="stats">
            {c.proof.stats.map((s, i) => (
              <div className="stat glass" key={i}>
                <div className="n">{s.n}</div>
                <div className="l">{s.l}</div>
              </div>
            ))}
          </div>
          <p className="proof-note">{c.proof.awardsLine}</p>

          <div className="sec-head" style={{ marginTop: 64 }}>
            <div className="kicker">{c.work.kicker}</div>
            <h2>{c.work.title}</h2>
            <p>{c.work.intro}</p>
          </div>
          <div className="svc">
            {c.work.items.map((w, i) => (
              <a className="card glass work-card" key={i} href={w.href} target="_blank" rel="noopener noreferrer">
                {w.image ? <img src={w.image} alt={w.title} style={{ borderRadius: 14, marginBottom: 14 }} /> : null}
                <div className="n">{w.n}</div>
                <div className="meta">{w.meta}</div>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
                <span className="go">Watch the reel →</span>
              </a>
            ))}
          </div>
          <p className="proof-note">{c.work.note}</p>
        </div>
      </section>

      {/* DEMOS */}
      {c.demos ? (
        <section id="demos">
          <div className="wrap">
            <div className="sec-head">
              <div className="kicker">{c.demos.kicker}</div>
              <h2>{c.demos.title}</h2>
              <p>{c.demos.intro}</p>
            </div>
            <div className="demogrid">
              {c.demos.items.map((d, i) => (
                <a className="democard glass" key={i} href={d.href} target="_blank" rel="noopener noreferrer">
                  <div className="demothumb" style={{ backgroundImage: `url(${d.image})` }}>
                    <span className="demopill">Live demo</span>
                  </div>
                  <div className="demobody">
                    <h3>{d.name}</h3>
                    <div className="demotag">{d.tagline}</div>
                    <p>{d.desc}</p>
                    <span className="go">View the demo →</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* FOUNDER */}
      <section id="about" className="founder">
        <div className="wrap">
          <div className="portrait">
            {c.founder.photo ? <img src={c.founder.photo} alt={c.founder.name} /> : <div className="mono">{c.founder.monogram}</div>}
          </div>
          <div>
            <div className="kicker">{c.founder.kicker}</div>
            <h2>{c.founder.name}</h2>
            <div className="badges">
              {c.founder.badges.map((b, i) => <span key={i}>{b}</span>)}
            </div>
            {c.founder.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            <a href={c.founder.ctaHref} className="btn dark" style={{ marginTop: 12 }}>{c.founder.ctaLabel}</a>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section id="process">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{c.process.kicker}</div>
            <h2>{c.process.title}</h2>
          </div>
          <div className="proc">
            {c.process.steps.map((s, i) => (
              <div className="pstep" key={i}>
                <div className="num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      {c.faq ? (
        <section id="faq">
          <div className="wrap">
            <div className="sec-head">
              <div className="kicker">{c.faq.kicker}</div>
              <h2>{c.faq.title}</h2>
              <p>{c.faq.intro}</p>
            </div>
            <FaqList faq={c.faq} />
          </div>
        </section>
      ) : null}

      {/* CONTACT */}
      <ContactSection contact={c.contact} />

      <footer>
        <div className="wrap">
          <div className="logo">{c.brand.name} <span>{c.brand.nameAccent}</span></div>
          <p>{c.footer.tagline}</p>
          <div className="socials">
            <a href={c.footer.ig} target="_blank" rel="noopener noreferrer">IG</a>
            <a href={`mailto:${c.footer.email}`}>@</a>
          </div>
          <div className="info">
            <a href={`mailto:${c.footer.email}`}>{c.footer.email}</a> · {c.footer.site}
          </div>
          <div className="fine">
            © {new Date().getFullYear()} No Empty Chair. Founded by Makayla Richards. · <a className="adminlink" href="/admin">Admin</a>
          </div>
        </div>
      </footer>

      <RadarModal radar={c.radar} />
    </>
  );
}

// FAQ accordion. Each question opens independently, and the set of open
// questions is remembered across reloads via localStorage.
function FaqList({ faq }) {
  const STORAGE_KEY = "nec-faq-open";
  const [open, setOpen] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  });

  const toggle = (i) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — accordion still works, just won't persist */
      }
      return next;
    });
  };

  return (
    <div className="faq">
      {faq.items.map((f, i) => {
        const isOpen = open.has(i);
        return (
          <div className={"faq-item glass" + (isOpen ? " open" : "")} key={i}>
            <button
              type="button"
              className="faq-q"
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
            >
              <span>{f.q}</span>
              <span className="faq-icon" aria-hidden="true">{isOpen ? "–" : "+"}</span>
            </button>
            <div className="faq-a" hidden={!isOpen}>
              <p>{f.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContactSection({ contact }) {
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

import Link from "next/link";
import {
  ArrowDown, ArrowRight, BadgeCheck, ChartColumn, Check, Clock, FileText, Filter, Globe, Inbox, Mail, MessageCircle,
  Palette, PenLine, Send, ShieldCheck, Target, Users, Workflow, Zap,
} from "lucide-react";
import type { Service } from "@/lib/marketing/services";
import { HOW_WE_WORK, NEXT_STEPS, type Flagship, type ScopeIcon } from "@/lib/marketing/flagships";
import { LeadForm } from "@/app/marketing/lead-form";
import { ServiceIcon } from "@/app/marketing/service-icon";
import "./flagship.css";

// The richer layout for the three flagship services. A server component: everything here is static
// markup, and the only client code on the page is the enquiry form it already shared with every
// other service screen. Each page sets one accent (mint, sky or amber) on the root, and every
// highlighted element reads it from --ix-f-accent, so the three pages share one design and differ
// only in colour and content.

const SCOPE_ICONS: Record<ScopeIcon, typeof Target> = {
  target: Target, palette: Palette, pen: PenLine, chat: MessageCircle, send: Send, chart: ChartColumn, shield: ShieldCheck,
  users: Users, mail: Mail, zap: Zap, filter: Filter, file: FileText, inbox: Inbox, workflow: Workflow,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function FlagshipPage({ service, flagship, others }: { service: Service; flagship: Flagship; others: Service[] }) {
  const path = `/services/${service.slug}`;
  const steps = NEXT_STEPS(flagship.freeCheck);
  const freeIsRoute = flagship.freeCheck.href.startsWith("/");

  return (
    <main className={`ix-m-main ix-f ix-f--${flagship.accent}`}>
      {/* ---------- Hero ---------- */}
      <header className="ix-m-hero ix-f-hero">
        <div className="ix-f-hero-glow" aria-hidden="true" />
        <div className="ix-f-hero-copy">
          <ol className="ix-m-crumbs" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/services">Services</Link></li>
            <li aria-current="page">{service.title}</li>
          </ol>
          <span className="ix-l-eyebrow ix-f-eyebrow"><ServiceIcon name={service.icon} size={13} /> {service.eyebrow}</span>
          <h1>{service.h1}</h1>
          <p className="ix-f-lede">{service.intro}</p>
          <ul className="ix-f-points">
            {flagship.heroPoints.map(point => <li key={point}><span className="ix-f-tick"><Check size={13} aria-hidden="true" /></span>{point}</li>)}
          </ul>
          <div className="ix-l-hero-ctas">
            <a href="#enquiry" className="ix-l-btn-solid">Book a fit call <ArrowRight size={15} style={{ display: "inline", marginLeft: 4, verticalAlign: -2 }} /></a>
            {freeIsRoute
              ? <Link href={flagship.freeCheck.href} className="ix-l-btn-ghost ix-f-ghost">{flagship.freeCheck.cta}</Link>
              : <a href={flagship.freeCheck.href} className="ix-l-btn-ghost ix-f-ghost">{flagship.freeCheck.cta}</a>}
          </div>
        </div>

        <figure className="ix-f-example" aria-label={flagship.example.label}>
          <figcaption><span className="ix-f-badge">Illustrative</span>{flagship.example.label.replace(/^Illustrative example: /, "")}</figcaption>
          <div className="ix-f-before">
            <span className="ix-f-tag">{flagship.example.beforeTag}</span>
            <p>{flagship.example.before}</p>
          </div>
          <div className="ix-f-arrow" aria-hidden="true"><ArrowDown size={16} /></div>
          <div className="ix-f-after">
            <span className="ix-f-tag ix-f-tag--accent">{flagship.example.afterTag}</span>
            <p>{flagship.example.after}</p>
          </div>
        </figure>
      </header>

      {/* ---------- The problem ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-problem">
        <div className="ix-l-section-head">
          <span>THE PROBLEM</span>
          <h2 id="ix-f-problem">What&apos;s usually holding you back.</h2>
        </div>
        <div className="ix-f-problems">
          {service.problems.map((problem, index) => (
            <div className="ix-l-card ix-f-problem" key={problem.title}>
              <span className="ix-f-num" aria-hidden="true">{pad(index + 1)}</span>
              <h3>{problem.title}</h3>
              <p>{problem.body}</p>
            </div>
          ))}
        </div>
        <blockquote className="ix-f-quote">
          <p>{flagship.quote}</p>
          <cite>The Improvexus team</cite>
        </blockquote>
      </section>

      {/* ---------- The system ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-system">
        <div className="ix-l-section-head">
          <span>THE SYSTEM</span>
          <h2 id="ix-f-system">{flagship.system.title}.</h2>
          <p>{flagship.system.intro}</p>
        </div>
        <ol className="ix-f-steps">
          {flagship.system.steps.map((step, index) => (
            <li key={step.name}>
              <span className="ix-f-step-num">{index + 1}</span>
              <h3>{step.name}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="ix-f-outcome">
          <BadgeCheck size={22} aria-hidden="true" />
          <div><b>{flagship.system.outcome.name}</b><p>{flagship.system.outcome.body}</p></div>
        </div>
        <div className="ix-f-pillars">
          {flagship.pillars.map(pillar => (
            <div className="ix-f-pillar" key={pillar.title}>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Scope ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-scope">
        <div className="ix-l-section-head">
          <span>WHAT&apos;S INCLUDED</span>
          <h2 id="ix-f-scope">Everything we can run for you.</h2>
          <p>We agree on the call which parts your business needs. You never pay for the rest.</p>
        </div>
        <div className={flagship.scope.length === 4 ? "ix-f-scope ix-f-scope--4" : "ix-f-scope"}>
          {flagship.scope.map(group => {
            const Icon = SCOPE_ICONS[group.icon];
            return (
              <div className="ix-l-card ix-f-scope-card" key={group.title}>
                <span className="ix-l-icon ix-f-icon"><Icon size={18} aria-hidden="true" /></span>
                <h3>{group.title}</h3>
                <ul>{group.items.map(item => <li key={item}><Check size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Roadmap and rhythm ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-roadmap">
        <div className="ix-l-section-head">
          <span>{flagship.roadmap ? "YOUR FIRST 90 DAYS" : "HOW IT RUNS"}</span>
          <h2 id="ix-f-roadmap">{flagship.roadmap ? "A clear plan from day one." : "You always know what's happening."}</h2>
          <p>{flagship.roadmap ? "You always know what's happening this week and what comes next." : "The work follows the same rhythm every week, so nothing depends on anyone remembering."}</p>
        </div>
        {flagship.roadmap && (
          <ol className="ix-f-roadmap">
            {flagship.roadmap.map(phase => (
              <li key={phase.name}>
                <span className="ix-f-dot" aria-hidden="true" />
                <span className="ix-f-when">{phase.when}</span>
                <h3>{phase.name}</h3>
                <p>{phase.body}</p>
              </li>
            ))}
          </ol>
        )}
        <h3 className="ix-f-subhead"><Clock size={16} aria-hidden="true" /> {flagship.rhythmTitle}</h3>
        <div className={`ix-f-rhythm ix-f-rhythm--${flagship.rhythm.length}`}>
          {flagship.rhythm.map(item => (
            <div className="ix-f-rhythm-card" key={item.when}>
              <span>{item.when}</span>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- What we measure ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-measure">
        <div className="ix-l-section-head">
          <span>REPORTING</span>
          <h2 id="ix-f-measure">What we measure.</h2>
          <p>Every report answers three questions: what moved, what didn&apos;t, and what we&apos;re changing next.</p>
        </div>
        <div className="ix-f-measures">
          {flagship.measures.map(column => (
            <div className="ix-f-measure" key={column.title}>
              <h3>{column.title}</h3>
              <ul>{column.items.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How we work ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-work">
        <div className="ix-l-section-head">
          <span>HOW WE WORK</span>
          <h2 id="ix-f-work">How we work together.</h2>
        </div>
        <div className="ix-f-work">
          <div className="ix-f-guarantee">
            <ShieldCheck size={26} aria-hidden="true" />
            <h3>{HOW_WE_WORK.guarantee.title}</h3>
            <p>{HOW_WE_WORK.guarantee.body}</p>
          </div>
          <div className="ix-f-work-grid">
            <div className="ix-f-work-card"><h3>{flagship.safety.title}</h3><p>{flagship.safety.body}</p></div>
            {HOW_WE_WORK.cards.map(card => (
              <div className="ix-f-work-card" key={card.title}>
                {card.title === "Where we work from" && <Globe size={15} aria-hidden="true" className="ix-f-inline-icon" />}
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-faq">
        <div className="ix-l-section-head">
          <span>QUESTIONS</span>
          <h2 id="ix-f-faq">Questions we hear most.</h2>
        </div>
        <div className="ix-m-faq">
          {service.faqs.map(faq => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Next steps + enquiry ---------- */}
      <section className="ix-l-section" aria-labelledby="ix-f-start">
        <div className="ix-l-work-grid">
          <div>
            <div className="ix-l-section-head" style={{ marginBottom: 24 }}>
              <span>NEXT STEPS</span>
              <h2 id="ix-f-start">Three steps to a fuller pipeline.</h2>
              <p>Send the form and we&apos;ll answer within one working day.</p>
            </div>
            <ol className="ix-f-next">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="ix-f-step-num">{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.body}</p></div>
                </li>
              ))}
            </ol>
            <p className="ix-l-footer-head" style={{ marginTop: 28 }}>Other ways we help</p>
            <ul className="ix-m-chips">
              {others.map(other => <li key={other.slug}><Link href={`/services/${other.slug}`}>{other.title}</Link></li>)}
            </ul>
          </div>
          <LeadForm source="landing_service" sourcePage={path} cta="Book my fit call" />
        </div>
      </section>

      {/* Phones: the form is far down a long page, so a slim bar keeps the next step one tap away. */}
      <a href="#enquiry" className="ix-f-mobile-cta">Book a fit call <ArrowRight size={15} aria-hidden="true" /></a>
    </main>
  );
}

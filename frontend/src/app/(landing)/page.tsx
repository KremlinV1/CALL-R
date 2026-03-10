'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Phone, Bot, Megaphone, Shield, BarChart3, Zap, ArrowRight, Star,
  PhoneCall, Users, MessageSquare, Clock, CheckCircle2, ChevronRight,
  Globe, Headphones, TrendingUp, Play, Menu, X,
} from 'lucide-react';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* ─── Navigation ──────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Pon-E-Line</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#how-it-works">How It Works</NavLink>
            <NavLink href="#pricing">Pricing</NavLink>
            <NavLink href="#testimonials">Testimonials</NavLink>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium bg-white text-black px-5 py-2 rounded-full hover:bg-white/90 transition-colors"
            >
              Try For Free
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 text-white/70 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-white/5 px-6 py-4 space-y-3">
            <MobileNavLink href="#features" onClick={() => setMobileMenuOpen(false)}>Features</MobileNavLink>
            <MobileNavLink href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</MobileNavLink>
            <MobileNavLink href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</MobileNavLink>
            <MobileNavLink href="#testimonials" onClick={() => setMobileMenuOpen(false)}>Testimonials</MobileNavLink>
            <div className="flex gap-3 pt-3 border-t border-white/10">
              <Link href="/login" className="flex-1 text-center text-sm text-white/70 border border-white/20 rounded-full py-2 hover:bg-white/5">Login</Link>
              <Link href="/signup" className="flex-1 text-center text-sm font-medium bg-white text-black rounded-full py-2">Try For Free</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Background gradient */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] rounded-full bg-gradient-to-b from-blue-600/20 via-violet-600/10 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-medium tracking-wider uppercase">
              <Zap className="h-3 w-3" />
              #1 AI Voice Agent Platform for Automating Calls
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-center text-5xl md:text-7xl lg:text-8xl font-light tracking-tight leading-[1.1] text-white max-w-5xl mx-auto">
            Meet your AI call center{' '}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-300 bg-clip-text text-transparent">
              from the future.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="text-center text-lg md:text-xl text-white/50 max-w-2xl mx-auto mt-8 leading-relaxed">
            Build, deploy, and manage next-generation AI voice agents that sound human,
            execute tasks, and scale effortlessly.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/signup"
              className="group flex items-center gap-2 bg-white text-black font-medium px-8 py-3.5 rounded-full hover:bg-white/90 transition-all text-sm"
            >
              Start Building Free
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="#demo"
              className="group flex items-center gap-2 border border-white/20 text-white/80 font-medium px-8 py-3.5 rounded-full hover:bg-white/5 hover:border-white/30 transition-all text-sm"
            >
              <Play className="h-4 w-4" />
              Try Our Live Demo
            </Link>
          </div>

          {/* Trust badge */}
          <div className="flex items-center justify-center gap-2 mt-10">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <span className="text-sm text-white/40">4.9/5 from 200+ businesses</span>
          </div>
        </div>
      </section>

      {/* ─── Logo Ticker ─────────────────────────────────────────── */}
      <section className="py-12 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs tracking-widest uppercase text-white/30 mb-8">
            Trusted by forward-thinking companies
          </p>
          <div className="flex items-center justify-center gap-12 md:gap-16 flex-wrap opacity-40">
            {['TechCorp', 'Vertex AI', 'CallFlow', 'NovaDial', 'SalesForce', 'CloudTalk'].map((name) => (
              <span key={name} className="text-lg md:text-xl font-bold tracking-tight text-white/80">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Grid ───────────────────────────────────────── */}
      <section id="features" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm tracking-widest uppercase text-blue-400 mb-3">Platform Features</p>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight">
              Everything you need to automate calls
            </h2>
            <p className="text-white/40 mt-4 max-w-xl mx-auto">
              A complete platform for building, deploying, and monitoring AI voice agents at scale.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Bot className="h-6 w-6" />}
              title="AI Voice Agents"
              description="Design intelligent agents with custom personas, scripts, and decision trees. Natural-sounding conversations powered by advanced LLMs."
              gradient="from-blue-500/20 to-violet-500/20"
            />
            <FeatureCard
              icon={<Megaphone className="h-6 w-6" />}
              title="Automated Campaigns"
              description="Launch outbound call campaigns with smart throttling, retry logic, and real-time progress tracking. Scale to thousands of calls."
              gradient="from-violet-500/20 to-pink-500/20"
            />
            <FeatureCard
              icon={<PhoneCall className="h-6 w-6" />}
              title="Live Call Monitor"
              description="Watch every active call in real-time. See agent performance, call status, and campaign metrics as they happen."
              gradient="from-green-500/20 to-emerald-500/20"
            />
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6" />}
              title="SMS Messaging"
              description="Send and receive text messages from your phone numbers. Manage conversations with contacts alongside voice."
              gradient="from-orange-500/20 to-yellow-500/20"
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="DNC Compliance"
              description="Built-in Do Not Call list management with automatic campaign scrubbing, calling hours enforcement, and opt-out handling."
              gradient="from-red-500/20 to-orange-500/20"
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Analytics & Insights"
              description="Deep analytics on call outcomes, agent performance, sentiment analysis, and conversation transcripts with AI summaries."
              gradient="from-cyan-500/20 to-blue-500/20"
            />
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 md:py-32 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm tracking-widest uppercase text-blue-400 mb-3">How It Works</p>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight">
              Three steps to your AI call center
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="01"
              title="Build Your Agent"
              description="Configure your AI voice agent with a custom persona, voice, script, and decision logic. No code required."
              icon={<Bot className="h-8 w-8" />}
            />
            <StepCard
              step="02"
              title="Connect & Deploy"
              description="Assign phone numbers, set up inbound routing, or launch outbound campaigns. Go live in minutes."
              icon={<Globe className="h-8 w-8" />}
            />
            <StepCard
              step="03"
              title="Monitor & Scale"
              description="Track every call in real-time, analyze results, and continuously optimize your agents' performance."
              icon={<TrendingUp className="h-8 w-8" />}
            />
          </div>
        </div>
      </section>

      {/* ─── Stats Section ───────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatBlock value="10M+" label="Calls Handled" />
            <StatBlock value="99.9%" label="Uptime SLA" />
            <StatBlock value="<500ms" label="Response Latency" />
            <StatBlock value="200+" label="Enterprise Clients" />
          </div>
        </div>
      </section>

      {/* ─── Testimonials ────────────────────────────────────────── */}
      <section id="testimonials" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm tracking-widest uppercase text-blue-400 mb-3">Testimonials</p>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight">
              Loved by teams everywhere
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <TestimonialCard
              quote="Pon-E-Line replaced our entire outbound team. The AI agents handle objections better than most humans and never need a coffee break."
              author="Sarah Chen"
              role="VP Sales, TechCorp"
            />
            <TestimonialCard
              quote="We went from 200 daily calls to 5,000 overnight. The campaign automation and real-time monitoring are game-changers."
              author="Marcus Williams"
              role="CEO, NovaDial"
            />
            <TestimonialCard
              quote="The compliance features alone are worth it. DNC management, calling hours — everything we need to stay on the right side of regulations."
              author="Jessica Park"
              role="Head of Ops, CloudTalk"
            />
          </div>
        </div>
      </section>

      {/* ─── Pricing Preview ─────────────────────────────────────── */}
      <section id="pricing" className="py-24 md:py-32 bg-gradient-to-b from-transparent via-violet-950/10 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm tracking-widest uppercase text-blue-400 mb-3">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight">
              Simple, usage-based pricing
            </h2>
            <p className="text-white/40 mt-4 max-w-xl mx-auto">
              Start free. Scale as you grow. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <PricingCard
              tier="Starter"
              price="Free"
              description="Perfect for testing and prototyping"
              features={['100 minutes/month', '1 AI Agent', '1 Phone Number', 'Basic Analytics', 'Email Support']}
            />
            <PricingCard
              tier="Pro"
              price="$500"
              period="/mo"
              description="For growing teams and campaigns"
              features={['4,000 minutes/month', 'Unlimited Agents', '10 Phone Numbers', 'Live Monitor', 'SMS Messaging', 'DNC Compliance', 'Priority Support']}
              highlighted
            />
            <PricingCard
              tier="Enterprise"
              price="$1000"
              period="/mo"
              description="For large-scale operations"
              features={['Unlimited minutes', 'Unlimited everything', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee', '24/7 phone support']}
            />
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─────────────────────────────────────────── */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative rounded-3xl overflow-hidden">
            {/* BG gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIi8+PC9zdmc+')] opacity-30" />

            <div className="relative text-center py-16 md:py-24 px-8">
              <h2 className="text-3xl md:text-5xl font-light tracking-tight text-white max-w-3xl mx-auto">
                Ready to transform your call operations?
              </h2>
              <p className="text-white/70 mt-4 max-w-xl mx-auto text-lg">
                Join hundreds of businesses already using Pon-E-Line to automate calls, boost conversions, and scale effortlessly.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                <Link
                  href="/signup"
                  className="group flex items-center gap-2 bg-white text-black font-medium px-8 py-3.5 rounded-full hover:bg-white/90 transition-all text-sm"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="#"
                  className="flex items-center gap-2 border border-white/30 text-white font-medium px-8 py-3.5 rounded-full hover:bg-white/10 transition-all text-sm"
                >
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold tracking-tight">Pon-E-Line</span>
              </Link>
              <p className="text-sm text-white/40 leading-relaxed">
                The enterprise AI voice platform for automating phone calls at scale.
              </p>
            </div>
            <FooterCol title="Product" links={[
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Integrations', href: '#' },
              { label: 'Changelog', href: '#' },
            ]} />
            <FooterCol title="Resources" links={[
              { label: 'Documentation', href: '#' },
              { label: 'API Reference', href: '#' },
              { label: 'Blog', href: '#' },
              { label: 'Status', href: '#' },
            ]} />
            <FooterCol title="Company" links={[
              { label: 'About', href: '#' },
              { label: 'Careers', href: '#' },
              { label: 'Privacy', href: '#' },
              { label: 'Terms', href: '#' },
            ]} />
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Pon-E-Line. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="text-xs text-white/30 hover:text-white/60">Twitter</a>
              <a href="#" className="text-xs text-white/30 hover:text-white/60">LinkedIn</a>
              <a href="#" className="text-xs text-white/30 hover:text-white/60">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm text-white/60 hover:text-white transition-colors">
      {children}
    </a>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <a href={href} onClick={onClick} className="block text-sm text-white/70 hover:text-white py-2">
      {children}
    </a>
  );
}

function FeatureCard({
  icon, title, description, gradient,
}: {
  icon: React.ReactNode; title: string; description: string; gradient: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-300">
      <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} mb-4`}>
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  step, title, description, icon,
}: {
  step: string; title: string; description: string; icon: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-white/5 mb-6">
        {icon}
      </div>
      <p className="text-xs font-medium tracking-widest text-blue-400 mb-2">{step}</p>
      <h3 className="text-xl font-medium mb-3">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed max-w-xs mx-auto">{description}</p>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-4xl md:text-5xl font-light bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
        {value}
      </p>
      <p className="text-sm text-white/40 mt-2">{label}</p>
    </div>
  );
}

function TestimonialCard({ quote, author, role }: { quote: string; author: string; role: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
        ))}
      </div>
      <p className="text-sm text-white/60 leading-relaxed mb-6">&ldquo;{quote}&rdquo;</p>
      <div>
        <p className="text-sm font-medium">{author}</p>
        <p className="text-xs text-white/40">{role}</p>
      </div>
    </div>
  );
}

function PricingCard({
  tier, price, period, description, features, highlighted,
}: {
  tier: string; price: string; period?: string; description: string; features: string[]; highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 flex flex-col ${
        highlighted
          ? 'border-blue-500/30 bg-gradient-to-b from-blue-500/10 to-violet-500/5 relative'
          : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full text-xs font-medium">
          Most Popular
        </div>
      )}
      <p className="text-sm font-medium text-blue-400 mb-1">{tier}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-4xl font-light">{price}</span>
        {period && <span className="text-sm text-white/40">{period}</span>}
      </div>
      <p className="text-xs text-white/40 mb-6">{description}</p>
      <ul className="space-y-2.5 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-white/60">
            <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`block text-center text-sm font-medium py-2.5 rounded-full transition-colors ${
          highlighted
            ? 'bg-white text-black hover:bg-white/90'
            : 'border border-white/10 text-white hover:bg-white/5'
        }`}
      >
        Get Started
      </Link>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-sm font-medium mb-4">{title}</p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-white/40 hover:text-white/70 transition-colors">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

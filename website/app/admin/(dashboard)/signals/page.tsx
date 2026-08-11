'use client';

import { useState } from 'react';
import { getSupabase } from '../../../../lib/supabase';

type SignalForm = {
  asset: string;
  direction: 'BUY' | 'SELL';
  entry_price: string;
  take_profit: string;
  stop_loss: string;
  confidence_score: string;
  rationale: string;
  is_vip_only: boolean;
};

const EMPTY_FORM: SignalForm = {
  asset: '',
  direction: 'BUY',
  entry_price: '',
  take_profit: '',
  stop_loss: '',
  confidence_score: '',
  rationale: '',
  is_vip_only: false,
};

export default function SignalsManager() {
  const [form, setForm] = useState<SignalForm>(EMPTY_FORM);
  const [factorInput, setFactorInput] = useState('');
  const [confluenceFactors, setConfluenceFactors] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [publishing, setPublishing] = useState(false);

  function addFactor() {
    const factor = factorInput.trim();
    if (!factor || confluenceFactors.includes(factor)) return;
    setConfluenceFactors((current) => [...current, factor]);
    setFactorInput('');
  }

  function removeFactor(factor: string) {
    setConfluenceFactors((current) => current.filter((item) => item !== factor));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);
    setStatus('Publishing…');
    try {
      const confidence = Number(form.confidence_score);
      if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
        throw new Error('Confidence score must be an integer from 0 to 100.');
      }

      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('ai_signals').insert({
        asset: form.asset.trim(),
        direction: form.direction,
        entry_price: Number(form.entry_price),
        take_profit: Number(form.take_profit),
        stop_loss: Number(form.stop_loss),
        confidence_score: confidence,
        rationale: form.rationale.trim(),
        confluence_factors: confluenceFactors,
        is_vip_only: form.is_vip_only,
      });
      if (error) throw error;

      setStatus('Signal published successfully.');
      setForm(EMPTY_FORM);
      setConfluenceFactors([]);
      setFactorInput('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to publish signal.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="p-5 md:p-8 lg:p-10">
      <p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">Market operations</p>
      <h1 className="mt-3 text-3xl font-black">AI Signals</h1>
      <form onSubmit={submit} className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-card p-6">
        <h2 className="font-bold">Broadcast a signal</h2>
        <div className="mt-5 grid gap-4">
          <input required value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} className="rounded-xl border border-white/10 bg-ink p-3" placeholder="Asset e.g. EURUSD" />
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as SignalForm['direction'] })} className="rounded-xl border border-white/10 bg-ink p-3">
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <div className="grid grid-cols-3 gap-3">
            {(['entry_price', 'take_profit', 'stop_loss'] as const).map((key) => (
              <input required key={key} type="number" step="any" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="rounded-xl border border-white/10 bg-ink p-3" placeholder={key.replace('_', ' ')} />
            ))}
          </div>
          <input required type="number" min="0" max="100" step="1" value={form.confidence_score} onChange={(e) => setForm({ ...form, confidence_score: e.target.value })} className="rounded-xl border border-white/10 bg-ink p-3" placeholder="Confidence score e.g. 85" />
          <textarea required rows={4} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} className="rounded-xl border border-white/10 bg-ink p-3" placeholder="Bullish divergence converging with 4H support" />
          <div className="rounded-xl border border-white/10 bg-ink p-3">
            <label className="text-sm font-semibold">Technical confluence</label>
            <div className="mt-2 flex gap-2">
              <input value={factorInput} onChange={(e) => setFactorInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFactor(); } }} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-card p-2" placeholder="e.g. 4H Order Block Retest" />
              <button type="button" onClick={addFactor} className="rounded-lg border border-cyan px-3 py-2 text-sm font-bold text-cyan">Add Factor</button>
            </div>
            {confluenceFactors.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {confluenceFactors.map((factor) => (
                  <span key={factor} className="inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs text-cyan">
                    {factor}
                    <button type="button" onClick={() => removeFactor(factor)} aria-label={`Remove ${factor}`} className="font-bold text-cyan hover:text-white">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input type="checkbox" checked={form.is_vip_only} onChange={(e) => setForm({ ...form, is_vip_only: e.target.checked })} /> VIP-only signal
          </label>
          <button disabled={publishing} className="rounded-xl bg-cyan py-3 font-bold text-ink disabled:opacity-50">{publishing ? 'Publishing…' : 'Publish signal'}</button>
          {status && <p role="status" className="text-sm text-cyan">{status}</p>}
        </div>
      </form>
    </div>
  );
}
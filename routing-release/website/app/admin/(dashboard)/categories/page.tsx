'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Term = { id: number; name: string; kind: 'category' | 'tag'; created_at: string };

export default function CategoriesPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Term['kind']>('category');
  const [status, setStatus] = useState('Loading taxonomy…');

  const load = async () => {
    try {
      const res = await fetch('/api/admin/taxonomy', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Unable to load taxonomy.');
      setTerms(body.terms ?? []);
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load taxonomy.');
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatus('Saving…');
    try {
      const res = await fetch('/api/admin/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, kind }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Unable to create term.');
      setTerms((items) => [...items, body.term].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create term.');
    }
  };

  const remove = async (term: Term) => {
    if (!window.confirm(`Delete the ${term.kind} "${term.name}"?`)) return;
    const res = await fetch(`/api/admin/taxonomy?id=${term.id}`, { method: 'DELETE' });
    if (res.ok) setTerms((items) => items.filter((item) => item.id !== term.id));
    else setStatus('Unable to delete this term.');
  };

  const categories = terms.filter((term) => term.kind === 'category');
  const tags = terms.filter((term) => term.kind === 'tag');

  const chip = (term: Term) => (
    <span className="flex items-center gap-2 rounded-xl border border-gray-800 bg-[#111111] px-4 py-3 text-sm font-semibold text-gray-200" key={term.id}>
      {term.name}
      <button onClick={() => void remove(term)} className="text-gray-500 hover:text-red-400" aria-label={`Delete ${term.name}`}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );

  return (
    <div className="p-5 md:p-8 lg:p-10">
      <p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Taxonomy</p>
      <h1 className="mt-3 text-3xl font-black">Categories & Tags</h1>
      <p className="mt-2 text-sm text-gray-400">Editorial categories and tags shared with the Market Insights editor.</p>

      <form onSubmit={create} className="mt-7 flex max-w-2xl flex-wrap gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-52 flex-1 rounded-xl border border-gray-700 bg-black p-3 text-sm"
          placeholder="New category or tag name"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value as Term['kind'])} className="rounded-xl border border-gray-700 bg-black p-3 text-sm">
          <option value="category">Category</option>
          <option value="tag">Tag</option>
        </select>
        <button className="flex items-center gap-2 rounded-xl bg-[#00FFFF] px-4 py-3 text-sm font-bold text-black">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {status && <p className="mt-5 text-sm text-gray-400">{status}</p>}

      <h2 className="mt-9 text-sm font-bold uppercase tracking-widest text-gray-500">Categories</h2>
      <div className="mt-4 flex max-w-3xl flex-wrap gap-3">
        {categories.map(chip)}
        {!categories.length && !status && <p className="text-sm text-gray-500">No categories yet — add your first above.</p>}
      </div>

      <h2 className="mt-9 text-sm font-bold uppercase tracking-widest text-gray-500">Tags</h2>
      <div className="mt-4 flex max-w-3xl flex-wrap gap-3">
        {tags.map(chip)}
        {!tags.length && !status && <p className="text-sm text-gray-500">No tags yet — add one above to start tagging insights.</p>}
      </div>
    </div>
  );
}

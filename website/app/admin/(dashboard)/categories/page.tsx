const categories = ['Discussion', 'Analysis', 'News', 'Strategy', 'Psychology', 'Brokers', 'Signals', 'Education', 'Results'];

export default function CategoriesPage() {
  return <div className="p-5 md:p-8 lg:p-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Taxonomy</p><h1 className="mt-3 text-3xl font-black">Categories & Tags</h1><p className="mt-2 text-sm text-gray-400">Use these editorial categories when publishing market insights.</p><div className="mt-8 flex max-w-3xl flex-wrap gap-3">{categories.map((category) => <span className="rounded-xl border border-gray-800 bg-[#111111] px-4 py-3 text-sm font-semibold text-gray-200" key={category}>{category}</span>)}</div></div>;
}
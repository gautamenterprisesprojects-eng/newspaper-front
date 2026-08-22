export default function AdvertiserPage() {
  return <SimplePage title="विज्ञापन" text="यहां आगे विज्ञापन booking और ad slots manage होंगे." />;
}

function SimplePage({ title, text }: { title: string; text: string }) {
  return <main className="min-h-screen bg-gray-50 p-8"><section className="max-w-4xl bg-white border border-gray-200 rounded-xl shadow-sm p-6"><h1 className="text-2xl font-bold text-gray-950">{title}</h1><p className="mt-2 text-sm text-gray-600">{text}</p></section></main>;
}

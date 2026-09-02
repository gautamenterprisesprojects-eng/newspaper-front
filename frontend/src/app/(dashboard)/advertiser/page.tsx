export default function AdvertiserPage() {
  return <SimplePage title="विज्ञापन" text="यहां आगे विज्ञापन booking और ad slots manage होंगे." />;
}

function SimplePage({ title, text }: { title: string; text: string }) {
  return <main className="min-h-screen bg-gray-50 p-8"><section className="max-w-4xl surface-card p-6"><h1 className="page-title text-2xl font-bold">{title}</h1><p className="mt-2 text-sm text-gray-600">{text}</p></section></main>;
}

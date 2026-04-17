export default function Home() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-blue-600">
      <div className="text-center text-white">
        <h1 className="text-6xl font-bold mb-4">UniboxAI</h1>
        <p className="text-xl mb-8">
          Unified WhatsApp inboxes for teams
        </p>
        <a
          href="/auth/sign-in"
          className="inline-block px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition"
        >
          Get Started
        </a>
      </div>
    </main>
  );
}

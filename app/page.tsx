import Navbar from "@/components/Navbar";
import StockList from "@/components/StockList";
import Leaderboard from "@/components/Leaderboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <StockList />
        </div>
        <div>
          <Leaderboard />
        </div>
      </div>
    </main>
  );
}

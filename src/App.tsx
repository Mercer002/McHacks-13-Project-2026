import { BrowserRouter, Routes, Route, Link, useParams } from "react-router-dom";
import MyCalendar from "./pages/Calendar"; // import the styled calendar

function DayView() {
  const { date } = useParams();
  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-4 text-white">Planning for: {date}</h1>
      <div className="border p-4 rounded bg-gray-900 text-white">
        <p>Task list will go here...</p>
      </div>
      <Link to="/" className="text-green-500 underline mt-4 block hover:text-green-400">
        ← Back to Calendar
      </Link>
    </div>
  );
}

function Login() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl text-white">Login Page</h1>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white">
        <nav className="p-4 border-b shadow-sm flex justify-between items-center bg-gray-900">
          <span className="font-bold text-xl">TimePilot</span>
          <Link to="/login" className="text-sm text-gray-400">
            Login
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<MyCalendar />} />
          <Route path="/day/:date" element={<DayView />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

import { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import clsx from "clsx"; 
import "../App.css";


export default function MyCalendar() {
  const [date, setDate] = useState<Date>(new Date());

  return (
    <div className="max-w-6xl mx-auto p-8 bg-black shadow-xl rounded-xl min-h-screen">
      <h2 className="text-5xl font-bold mb-12 text-center text-white h-20 flex items-center justify-center">My Calendar</h2>

      <Calendar
        value={date}
        onChange={(val: any) => setDate(val as Date)}
        className="mx-auto border rounded-lg"
        tileClassName={({ date: tileDate, view }) => {
          if (view === "month") {
            return clsx(
              "p-6 text-center cursor-pointer transition-colors text-2xl font-semibold",
              // Base color for all days (so they are visible on white background)
              "bg-gray-50 text-gray-800",
              // Highlight today
              tileDate.toDateString() === new Date().toDateString()
                ? "border-4 border-blue-400 text-blue-700 font-bold bg-blue-100"
                : "",
              // Highlight selected date
              tileDate.toDateString() === date.toDateString()
                ? "bg-blue-600 text-white font-bold"
                : "",
              // Hover effect
              "hover:bg-blue-200"
            );
          }
          return "";
        }}
        prevLabel="‹"
        nextLabel="›"
        navigationLabel={({ label }) => (
          <span className="font-semibold text-white text-2xl">{label}</span>
        )}
      />

      <p className="mt-12 text-center text-white text-2xl mb-16">
        Selected date: <span className="font-semibold text-blue-400">{date.toDateString()}</span>
      </p>
      
      <div className="bg-gray-900 rounded-lg p-8 min-h-96 text-white text-lg">
        <h3 className="text-2xl font-bold mb-4">Events for {date.toDateString()}</h3>
        <p className="text-gray-400">Add your events and tasks here...</p>
      </div>
    </div>
  );
}

import { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import clsx from "clsx"; 
import "../App.css";


export default function MyCalendar() {
  const [date, setDate] = useState<Date>(new Date());

  return (
    <div className="max-w-6xl mx-auto p-2 bg-black">
      <h2 className="text-5xl font-bold mb-6 text-center text-white h-20 flex items-center justify-center">My Calendar</h2>

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
                ? "border-4 border-green-600 text-green-700 font-bold bg-green-100"
                : "",
              // Highlight selected date - only outline pops
              tileDate.toDateString() === date.toDateString()
                ? "border-4 border-green-600 text-gray-800"
                : "",
              // Hover effect - only outline pops
              "hover:border-4 hover:border-green-600 hover:bg-black-50"
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
        Selected date: <span className="font-semibold text-green-500">{date.toDateString()}</span>
      </p>
      
      <div className="bg-gray-900 rounded-lg p-8 min-h-96 text-white text-lg">
        <h3 className="text-2xl font-bold mb-4">Events for {date.toDateString()}</h3>
        <p className="text-gray-400">Add your events and tasks here...</p>
      </div>
    </div>
  );
}

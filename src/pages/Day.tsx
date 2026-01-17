import { useParams } from 'react-router-dom'

export default function Day() {
  const { date } = useParams()

  return (
    <div className="center">
      <h1>Day View</h1>
      <p>Date: {date}</p>
    </div>
  )
}
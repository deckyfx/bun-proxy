import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link to="/page2?foo=bar&baz=42">Go to Page 2</Link>
    </div>
  );
}

import { useNavigate, useLocation } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  console.log(queryParams);
  const foo = queryParams.get("foo");
  const baz = queryParams.get("baz");

  return (
    <div>
      <h1>Page 2</h1>
      <p>foo = {foo}</p>
      <p>baz = {baz}</p>
      <button onClick={() => navigate("/")}>Back to Home</button>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center">
      <h1>Not available</h1>
      <p className="lead">This page doesn&apos;t exist, or your groups don&apos;t include it.</p>
      <Link href="/">Back to home</Link>
    </div>
  );
}

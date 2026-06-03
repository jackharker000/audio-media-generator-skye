import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        That page or song doesn&apos;t exist (or isn&apos;t shared).
      </p>
      <Link href="/" className="btn-primary mt-4 inline-flex">
        Go home
      </Link>
    </div>
  );
}

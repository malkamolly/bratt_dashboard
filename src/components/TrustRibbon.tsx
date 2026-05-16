export function TrustRibbon() {
  return (
    <div className="bt-ribbon">
      <div className="mx-auto max-w-6xl px-4 py-2 text-center sm:px-6">
        {/* Phones: trimmed list so it doesn't wrap to 3 lines */}
        <span className="sm:hidden">
          FAMILY-OWNED &middot; LICENSED &middot; ISA-CERTIFIED
        </span>
        {/* sm+ : full list */}
        <span className="hidden sm:inline">
          FAMILY-OWNED SINCE 1991 &nbsp;&middot;&nbsp; LICENSED &nbsp;&middot;&nbsp; INSURED
          &nbsp;&middot;&nbsp; ISA-CERTIFIED &nbsp;&middot;&nbsp; SATISFACTION GUARANTEED
        </span>
      </div>
    </div>
  );
}

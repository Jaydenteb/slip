import { NextResponse, type NextRequest } from "next/server";

// Office pages need the visitor's own demo school. Anyone arriving without one (a new
// judge following a link straight to the ledger, say) goes through /demo first, which
// makes them a copy and brings them back. Server actions and the ledger's polling
// check the school themselves.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.method !== "GET" || pathname === "/office/ledger/data") return NextResponse.next();
  if (request.cookies.has("slip_school")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/demo";
  url.search = "";
  url.searchParams.set("to", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/office", "/office/:path*"],
};

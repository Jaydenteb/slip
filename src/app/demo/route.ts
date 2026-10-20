import { after, type NextRequest } from "next/server";
import { allow, clientIp, HOUR } from "@/lib/agent/rate-limit";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { clearOldSchools, createVisitorSchool, nguyenToken, rememberSchool, visitorSchoolId } from "@/lib/demo/visitor";

// The way into the demo: makes sure this visitor has their own copy of the school, then
// sends them on. /demo?to=office (the default), /demo?to=parent, or /demo?to=/office/...
export async function GET(request: NextRequest) {
  let schoolId = await visitorSchoolId();
  if (!schoolId) {
    // Making copies is limited, so a script can't fill the database. Past the limit,
    // visitors share the one school instead.
    const ip = clientIp(request.headers);
    const canCreate = allow(`new-school:${ip}`, 5, HOUR) && allow("new-school", 300, HOUR);
    try {
      schoolId = canCreate ? (await createVisitorSchool()).schoolId : DEMO_SCHOOL_ID;
    } catch (err) {
      console.error(err);
      schoolId = DEMO_SCHOOL_ID;
    }
    await rememberSchool(schoolId);
    after(() => clearOldSchools().catch(() => undefined));
  }

  const to = request.nextUrl.searchParams.get("to") ?? "office";
  let target = "/office/events";
  if (to === "parent") {
    const token = await nguyenToken(schoolId);
    target = token ? `/family/${token}` : "/";
  } else if (/^\/office(\/[\w-]+)*$/.test(to)) {
    target = to;
  }
  // A relative redirect: behind Render's proxy, request.url is the internal address.
  return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
}

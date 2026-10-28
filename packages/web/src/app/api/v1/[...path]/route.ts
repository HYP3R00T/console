import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      message:
        "Select an explicitly connected machine. The implicit local proxy has been retired.",
    },
    { status: 410 },
  );
}

export {
  retired as GET,
  retired as POST,
  retired as PATCH,
  retired as PUT,
  retired as DELETE,
};

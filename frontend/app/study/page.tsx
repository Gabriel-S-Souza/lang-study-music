import { Suspense, type ReactElement } from "react";

import { StudyShell } from "./StudyShell";

function StudyFallback(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] text-sm text-zinc-500">
      Carregando sessão…
    </div>
  );
}

export default function StudyPage(): ReactElement {
  return (
    <Suspense fallback={<StudyFallback />}>
      <StudyShell />
    </Suspense>
  );
}

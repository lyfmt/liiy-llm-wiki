import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

export function MetricCard({ label, value, note, accent }: { label: string; value: string | number; note?: string; accent?: ReactNode }) {
  return (
    <Card className="bg-white/80">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#66CCFF]">{label}</div>
            <div className="mt-3 text-3xl font-bold text-[#1C2833]">{value}</div>
          </div>
          {accent ? <div className="text-[#66CCFF]">{accent}</div> : null}
        </div>
        {note ? <p className="mt-3 text-sm leading-7 text-[#5D6D7E]">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

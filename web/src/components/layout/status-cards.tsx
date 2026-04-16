import { AlertTriangle, LoaderCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

export function LoadingState({ label }: { label: string }) {
  return (
    <Card className="bg-white/75">
      <CardContent className="flex items-center gap-3 p-6 text-sm text-[#5D6D7E]">
        <LoaderCircle className="animate-spin text-[#66CCFF]" size={18} />
        {label}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Card className="border-[#FFB7C5]/50 bg-[#FFF7F9]">
      <CardContent className="p-6 text-[#7A3647]">
        <div className="flex items-center gap-2 text-lg font-bold">
          <AlertTriangle size={18} />
          {title}
        </div>
        <p className="mt-3 text-sm leading-7">{message}</p>
      </CardContent>
    </Card>
  );
}

import AIAssistant from '../components/AIAssistant';
import { NeonCard } from '../components/ui';
import PrintButton from '../components/PrintButton';

export default function Assistant() {
  return (
    <div className="h-full min-h-[calc(100vh-160px)]">
      <div className="no-print flex justify-end mb-4">
        <PrintButton />
      </div>
      <NeonCard className="h-full p-0 overflow-hidden">
        <AIAssistant embedded />
      </NeonCard>
    </div>
  );
}

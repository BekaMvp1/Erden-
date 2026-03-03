import AIAssistant from '../components/AIAssistant';
import { NeonCard } from '../components/ui';

export default function Assistant() {
  return (
    <div className="h-full min-h-[calc(100vh-160px)]">
      <NeonCard className="h-full p-0 overflow-hidden">
        <AIAssistant embedded />
      </NeonCard>
    </div>
  );
}

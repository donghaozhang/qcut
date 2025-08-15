import { useSoundsStore } from '@/stores/sounds-store';
import { useEffect } from 'react';

export function TestSoundsStore() {
  const store = useSoundsStore();
  
  useEffect(() => {
    console.log('Sounds store loaded successfully:', {
      hasStore: !!store,
      searchQuery: store.searchQuery,
      isLoading: store.isLoading,
      savedSounds: store.savedSounds.length
    });
  }, [store]);

  return (
    <div className="p-4">
      <h3>Sounds Store Test</h3>
      <p>Check console for store status - should show no errors</p>
    </div>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import type { AppConfig, SavedServiceInstance, ServiceRecipe } from '../common/types';
import recipesJson from '../../recipes/services.json';
import { ServiceTab } from './components/ServiceTab';

declare global {
  interface Window {
    multi?: {
      getConfig(): Promise<AppConfig>;
      saveConfig(cfg: AppConfig): Promise<boolean>;
      sendUnreadTotal(count: number): void;
    };
  }
}

function sanitizeConfig(cfg: AppConfig, recipes: ServiceRecipe[]): AppConfig {
  const ids = new Set(recipes.map(r => r.id));
  const filtered = cfg.services.filter(s => ids.has(s.recipeId));
  if (filtered.length !== cfg.services.length) return { ...cfg, services: filtered };
  return cfg;
}

const Badge: React.FC<{ count: number }> = ({ count }) => {
  if (!count) return null;
  const label = count > 999 ? '999+' : String(count);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 20, height: 20, padding: '0 6px', borderRadius: 9999,
      background: '#ff3b30', color: '#fff', fontSize: 12, lineHeight: '20px', fontWeight: 700
    }}>{label}</span>
  );
};

const ServiceIcon: React.FC<{ recipe?: ServiceRecipe }> = ({ recipe }) => {
  const size = 26;
  const letter = (recipe?.name?.[0] ?? '?').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: '#2b2f36', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700
    }} aria-label={recipe?.name}>{letter}</div>
  );
};

export const App: React.FC = () => {
  const recipes = useMemo(() => recipesJson as ServiceRecipe[], []);
  const [config, setConfig] = useState<AppConfig>({ services: [], masterPasswordSet: false });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unreads, setUnreads] = useState<Record<string, number>>({});
  const [noPreload, setNoPreload] = useState(false);

  useEffect(() => {
    if (!window.multi) { setNoPreload(true); return; }
    window.multi.getConfig().then(cfg => {
      const clean = sanitizeConfig(cfg, recipes);
      if (clean !== cfg) window.multi!.saveConfig(clean);
      setConfig(clean);
      if (clean.services[0]) setActiveId(clean.services[0].instanceId);
    });
  }, [recipes]);

  useEffect(() => {
    if (!window.multi) return;
    const total = Object.values(unreads).reduce((a, b) => a + b, 0);
    window.multi.sendUnreadTotal(total);
  }, [unreads]);

  function addService(recipe: ServiceRecipe) {
    const id = crypto.randomUUID();
    const partition = `persist:service-${recipe.id}-${id.slice(0, 8)}`;
    const inst: SavedServiceInstance = { instanceId: id, recipeId: recipe.id, name: recipe.name, partition };
    if (recipe.url) inst.url = recipe.url.replace('__', '');
    const next = { ...config, services: [...config.services, inst] };
    setConfig(next);
    window.multi?.saveConfig(next);
    setActiveId(inst.instanceId);
  }

  function removeService(instanceId: string) {
    const next = { ...config, services: config.services.filter(s => s.instanceId !== instanceId) };
    setConfig(next);
    window.multi?.saveConfig(next);
    const nextActive = next.services[0]?.instanceId ?? null;
    setActiveId(nextActive);
    setUnreads(prev => { const p = { ...prev }; delete p[instanceId]; return p; });
  }

  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);

  if (noPreload) {
    return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      Preload не загрузился. Перезапустите dev: npm run dev. Убедитесь, что sandbox:false в src/main/main.ts.
    </div>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 260, borderRight: '1px solid #ddd', padding: 8, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Services</div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {config.services.map(s => {
            const recipe = recipeById.get(s.recipeId);
            const count = unreads[s.instanceId] || 0;
            return (
              <div key={s.instanceId} onClick={() => setActiveId(s.instanceId)} style={{
                padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                background: s.instanceId === activeId ? '#eef5ff' : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ServiceIcon recipe={recipe} />
                  <span>{s.name}</span>
                </div>
                <Badge count={count} />
              </div>
            );
          })}
        </div>
        <div>
          <select id="recipe" style={{ width: '100%', marginBottom: 6 }}>
            {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => {
            const sel = (document.getElementById('recipe') as HTMLSelectElement).value;
            const r = recipes.find(x => x.id === sel)!;
            addService(r);
          }} style={{ width: '100%' }}>Add service</button>
        </div>
      </aside>

      <main style={{ flex: 1, position: 'relative' }}>
        {config.services.length === 0 ? (
          <div style={{ padding: 24 }}>No service selected. Add one from the sidebar.</div>
        ) : (
          config.services.map(s => (
            <div key={s.instanceId} style={{ position: 'absolute', inset: 0, display: s.instanceId === activeId ? 'flex' : 'none' }}>
              <ServiceTab
                instance={s}
                recipe={recipeById.get(s.recipeId)}
                onClose={() => removeService(s.instanceId)}
                onUnreadChange={n => setUnreads(prev => ({ ...prev, [s.instanceId]: n }))}
              />
            </div>
          ))
        )}
      </main>
    </div>
  );
};
'use client'

import React, { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import Swal from 'sweetalert2';
import { PersonalSelect } from '@/components/ui/PersonalSelect';

interface ForgeArchiveProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isSpinning: boolean;
  onSpin: () => void;
  optionsCount: number;
}

interface ListItem {
  id: string;
  label: string;
  weight: number;
}

interface List {
  id: string;
  title: string;
  items: ListItem[];
}

type ListsResponse = {
  lists?: List[];
};

const parseLines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const buildCounts = (items: string[]): Record<string, number> => {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
};

export const ForgeArchive: React.FC<ForgeArchiveProps> = ({ 
  input, 
  setInput, 
  isSpinning, 
  onSpin,
  optionsCount 
}) => {
  const [lists, setLists] = useState<List[]>([]);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newOption, setNewOption] = useState('');

  // Fetch lists on mount
  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      const res = await fetch('/api/lists');
      if (!res.ok) throw new Error('Failed to fetch lists');
      const data: ListsResponse = await res.json();
      setLists(data.lists ?? []);
    } catch (e) {
      console.error('Failed to fetch lists', e);
    }
  };

  const loadList = (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (list) {
      // Flatten items based on weight (simple representation for text area)
      const items = list.items.flatMap(i => Array.from({ length: i.weight }, () => i.label));
      setInput(items.join('\n'));
      setCurrentListId(listId);
      setListName(list.title);
    }
  };

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed) {
      void Swal.fire({
        icon: 'warning',
        title: '請輸入選項內容',
        confirmButtonText: '好的',
        background: 'var(--color-samurai-dark)',
        color: 'var(--color-samurai-yellow)',
        confirmButtonColor: 'var(--color-samurai-red)'
      });
      return;
    }
    setInput((prev) => (prev ? `${prev}\n${trimmed}` : trimmed));
    setNewOption('');
    void Swal.fire({
      icon: 'success',
      title: '已加入新選項',
      timer: 1600,
      showConfirmButton: false,
      background: 'var(--color-samurai-dark)',
      color: 'var(--color-samurai-blue)'
    });
  };

  const deleteAllItems = async (list: List) => {
    await Promise.all(
      list.items.map(async (item) => {
        const form = new FormData();
        form.append('_method', 'DELETE');
        const res = await fetch(`/api/items/${item.id}`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          throw new Error('Failed to delete item');
        }
      })
    );
  };

  const saveList = async () => {
    const trimmedName = listName.trim();
    if (!trimmedName) {
      void Swal.fire({
        icon: 'warning',
        title: '請輸入卷軸名稱',
        background: 'var(--color-samurai-dark)',
        color: 'var(--color-samurai-yellow)',
        confirmButtonColor: 'var(--color-samurai-red)'
      });
      return;
    }

    const items = parseLines(input);
    if (items.length === 0) {
      void Swal.fire({
        icon: 'warning',
        title: '至少需要一個選項',
        background: 'var(--color-samurai-dark)',
        color: 'var(--color-samurai-yellow)',
        confirmButtonColor: 'var(--color-samurai-red)'
      });
      return;
    }
    const counts = buildCounts(items);

    setSaving(true);
    try {
      let targetListId = currentListId;

      // Auto-detect: if list name matches existing list, update it
      if (!currentListId) {
        const existingList = lists.find(l => l.title === trimmedName);
        if (existingList) {
          targetListId = existingList.id;
        }
      }

      if (targetListId) {
        // Update existing list
        const list = lists.find(l => l.id === targetListId);
        if (list) {
          await deleteAllItems(list);
        }

        // 2. Update list name
        await fetch(`/api/lists/${targetListId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmedName })
        });

        // 3. Add new items
        await Promise.all(Object.entries(counts).map(([label, weight]) =>
          fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listId: targetListId, label, weight })
          })
        ));

        void Swal.fire({
          icon: 'success',
          title: '卷軸已更新',
          timer: 1800,
          showConfirmButton: false,
          background: '#09090B',
          color: '#3B82F6'
        });
      } else {
        // Create new list
        const resList = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmedName }),
        });
        if (!resList.ok) throw new Error('Failed to create list');
        const { id } = await resList.json();

        await Promise.all(Object.entries(counts).map(([label, weight]) =>
          fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listId: id, label, weight })
          })
        ));

        setCurrentListId(id);
        void Swal.fire({
          icon: 'success',
          title: '已建立新的命運卷軸',
          timer: 1800,
          showConfirmButton: false,
          background: '#09090B',
          color: '#3B82F6'
        });
      }

      setListName(trimmedName);

      // Refresh lists
      await fetchLists();

    } catch (e) {
      console.error(e);
      void Swal.fire({
        icon: 'error',
        title: '鍛造失敗',
        text: '請稍後再試',
        background: 'var(--color-samurai-dark)',
        color: 'var(--color-samurai-red)'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative bg-samurai-dim/90 rounded-lg p-6 md:p-8 shadow-[0_0_30px_rgba(59,130,246,0.12)] border border-samurai-blue/30 backdrop-blur-sm group">
       {/* Glowing Top Edge */}
       <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-samurai-blue to-transparent shadow-[0_0_10px_rgba(59,130,246,0.6)]"></div>

       
       {/* Header */}
       <div className="text-center mb-6 mt-2">
         <h1 className="text-3xl md:text-5xl font-heading text-white font-bold drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] tracking-wide">
           DATA ARCHIVE
         </h1>
         <div className="flex items-center justify-center gap-4 mt-3 opacity-60">
            <div className="h-[1px] w-8 md:w-12 bg-samurai-blue"></div>
            <div className="w-2 h-2 bg-samurai-blue animate-pulse"></div>
            <div className="h-[1px] w-8 md:w-12 bg-samurai-blue"></div>
         </div>
       </div>

       {/* List Selection (Tech Dropdown) */}
       <div className="relative mb-4">
          <PersonalSelect ariaLabel="選擇卷軸" variant="tech" value={currentListId || ''} onChange={loadList} disabled={isSpinning} placeholder="SELECT DATASET..." options={lists.map((list) => ({ value: list.id, label: list.title }))} />
       </div>

       {/* Input Area */}
       <div className="relative mb-4 bg-samurai-dark/50 rounded border border-samurai-blue/20 shadow-inner overflow-hidden group-hover:border-samurai-blue/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-samurai-blue/20 to-transparent"></div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSpinning}
            className="w-full h-48 md:h-64 bg-transparent p-6 font-mono text-xl md:text-2xl text-samurai-text focus:outline-none focus:bg-samurai-dark transition-all resize-none custom-scrollbar leading-loose tracking-wide placeholder-samurai-blue/20"
            placeholder="INPUT DATA STREAM..."
          />
       </div>

       {/* Quick Add Option */}
       <div className="mb-6 flex flex-col gap-3 md:flex-row">
         <input
           type="text"
           value={newOption}
           onChange={(e) => setNewOption(e.target.value)}
           placeholder="ADD NEW ENTRY..."
           disabled={isSpinning}
           className="flex-1 bg-samurai-dark border border-samurai-blue/30 text-samurai-blue font-tech p-3 rounded focus:outline-none focus:border-samurai-blue placeholder-samurai-blue/20 disabled:opacity-50 uppercase tracking-wider"
         />
         <button
           type="button"
           onClick={handleAddOption}
           disabled={isSpinning}
           className="px-6 bg-samurai-blue/10 border border-samurai-blue text-samurai-blue font-tech tracking-[0.2em] uppercase rounded hover:bg-samurai-blue hover:text-samurai-dark transition disabled:opacity-40 disabled:cursor-not-allowed"
         >
           INSERT
         </button>
       </div>

       {/* Save Controls */}
       <div className="flex gap-2 mb-6">
          <input 
             type="text" 
             value={listName}
             onChange={(e) => setListName(e.target.value)}
             placeholder="DATASET NAME"
             className="flex-1 bg-samurai-dark border border-samurai-blue/30 text-samurai-blue font-tech p-3 rounded focus:outline-none focus:border-samurai-blue placeholder-samurai-blue/20 uppercase tracking-wider"
             disabled={isSpinning}
          />
          <button 
             onClick={saveList}
             disabled={saving || isSpinning}
             className="px-6 bg-samurai-dim border border-samurai-blue/50 text-white font-tech hover:bg-samurai-blue hover:text-samurai-dark transition-colors rounded disabled:opacity-50 uppercase tracking-wider"
          >
             {saving ? 'SAVING...' : 'SAVE'}
          </button>
       </div>

       {/* Action Button (The Trigger) */}
       <button
         onClick={onSpin}
         disabled={isSpinning || optionsCount < 2}
         className="w-full relative h-16 md:h-20 group/btn overflow-hidden rounded bg-samurai-blue/10 border border-samurai-blue hover:bg-samurai-blue hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
       >
          {/* Tech Background */}
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(59,130,246,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_linear_infinite]"></div>
          
          <div className="relative z-10 flex items-center justify-center gap-3">
              <span className="font-heading text-white text-xl md:text-2xl tracking-[0.2em] uppercase group-hover/btn:text-samurai-dark transition-all">
                {isSpinning ? 'PROCESSING...' : 'INITIATE SEQUENCE'}
              </span>
          </div>
       </button>
       
       {optionsCount < 2 && (
         <p className="text-center text-samurai-red font-tech mt-4 text-sm animate-pulse tracking-widest uppercase">
           ⚠ INSUFFICIENT DATA FOR PROCESSING
         </p>
       )}
    </div>
  );
};

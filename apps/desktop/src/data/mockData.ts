import type { Story, SettingCard, TreeNode } from '../types';

export const mockStories: Story[] = [
  {
    id: '1',
    title: '星港迷雾',
    description: '一枚古代星图碎片在港口重现，引发多方势力争夺。',
    updatedAt: new Date('2026-02-18'),
    coverColor: 'var(--coral-400)',
  },
  {
    id: '2',
    title: '回声之城',
    description: '一座会复述未来的城市，让每个选择都变得危险。',
    updatedAt: new Date('2026-02-17'),
    coverColor: 'var(--violet-400)',
  },
  {
    id: '3',
    title: '记忆花园',
    description: '围绕失落与治愈展开的群像故事，寻找新的归属。',
    updatedAt: new Date('2026-02-15'),
    coverColor: 'var(--teal-400)',
  },
  {
    id: '4',
    title: '绯色港湾',
    description: '旧时代海港的黑色侦探故事，真相藏在潮汐里。',
    updatedAt: new Date('2026-02-10'),
    coverColor: 'var(--amber-400)',
  },
];

export const mockSettingCards: SettingCard[] = [
  {
    id: 'c1',
    title: '林知夏',
    type: 'character',
    summary: '主角，考古修复师，曾失去一段关键记忆',
    color: 'var(--coral-400)',
    position: { x: 200, y: 150 },
    relations: [{ targetId: 'c2', type: '师徒' }],
  },
  {
    id: 'c2',
    title: '沈舟教授',
    type: 'character',
    summary: '文物学者，对古代航海文明有深度研究',
    color: 'var(--violet-400)',
    position: { x: 400, y: 100 },
    relations: [{ targetId: 'l1', type: '任职于' }],
  },
  {
    id: 'l1',
    title: '东港博物馆',
    type: 'location',
    summary: '故事主场景，存放关键星图碎片',
    color: 'var(--teal-400)',
    position: { x: 350, y: 280 },
    relations: [],
  },
  {
    id: 'i1',
    title: '星图碎片',
    type: 'item',
    summary: '能够映射隐藏航线的古代残片',
    color: 'var(--amber-400)',
    position: { x: 550, y: 200 },
    relations: [{ targetId: 'l1', type: '存放于' }],
  },
];

export const mockTreeData: TreeNode[] = [
  {
    id: 'ep1',
    type: 'ep',
    title: '第 1 集：碎片现身',
    children: [
      {
        id: 'sc1',
        type: 'scene',
        title: '场景 1：博物馆夜巡',
        children: [
          {
            id: 'sh1',
            type: 'shot',
            title: '镜头 1：大厅环摇',
            children: [
              { id: 't1', type: 'take', title: '拍次 1', children: [], isSelected: true },
              { id: 't2', type: 'take', title: '拍次 2', children: [] },
            ],
          },
          {
            id: 'sh2',
            type: 'shot',
            title: '镜头 2：主角入场',
            children: [
              { id: 't3', type: 'take', title: '拍次 1', children: [] },
            ],
          },
        ],
      },
      {
        id: 'sc2',
        type: 'scene',
        title: '场景 2：修复实验室',
        children: [
          {
            id: 'sh3',
            type: 'shot',
            title: '镜头 1：碎片检测',
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'ep2',
    type: 'ep',
    title: '第 2 集：潮汐真相',
    children: [],
  },
];

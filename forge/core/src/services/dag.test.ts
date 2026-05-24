import { describe, test, expect } from 'bun:test'
import { topologicalSort, type DagNode } from './dag'

describe('topologicalSort (Kahn)', () => {
  test('empty graph → empty order', () => {
    const { order, cycle } = topologicalSort([])
    expect(order).toEqual([])
    expect(cycle).toBe(false)
  })

  test('linear chain A → B → C', () => {
    const nodes: DagNode[] = [
      { id: 'C', dependances: ['B'] },
      { id: 'B', dependances: ['A'] },
      { id: 'A', dependances: [] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(false)
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'))
  })

  test('diamond A → {B, C} → D', () => {
    const nodes: DagNode[] = [
      { id: 'A', dependances: [] },
      { id: 'B', dependances: ['A'] },
      { id: 'C', dependances: ['A'] },
      { id: 'D', dependances: ['B', 'C'] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(false)
    expect(order[0]).toBe('A')
    expect(order[order.length - 1]).toBe('D')
    expect(order).toHaveLength(4)
  })

  test('isolated nodes all roots', () => {
    const nodes: DagNode[] = [
      { id: 'A', dependances: [] },
      { id: 'B', dependances: [] },
      { id: 'C', dependances: [] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(false)
    expect(order.sort()).toEqual(['A', 'B', 'C'])
  })

  test('cycle detected (A → B → A)', () => {
    const nodes: DagNode[] = [
      { id: 'A', dependances: ['B'] },
      { id: 'B', dependances: ['A'] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(true)
    expect(order.length).toBeLessThan(2)
  })

  test('orphan dependency on missing node is ignored', () => {
    // Le router ignore les deps qui pointent sur un nœud absent — on garde ce comportement
    const nodes: DagNode[] = [
      { id: 'A', dependances: ['ghost'] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(false)
    expect(order).toEqual(['A'])
  })

  test('self loop counts as cycle', () => {
    const nodes: DagNode[] = [
      { id: 'A', dependances: ['A'] },
      { id: 'B', dependances: [] },
    ]
    const { order, cycle } = topologicalSort(nodes)
    expect(cycle).toBe(true)
    expect(order).toContain('B')
    expect(order).not.toContain('A')
  })
})

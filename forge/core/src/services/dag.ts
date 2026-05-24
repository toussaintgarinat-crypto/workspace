// Topological sort (Kahn) — extrait pour test unitaire (S102).
// Source : src/api/routes/task-dag.ts. Le router en garde une copie inline
// pour ne pas casser le déploiement ; cette version est la référence testée.

export interface DagNode {
  id: string
  dependances: string[]
}

export interface TopoResult {
  order: string[]
  cycle: boolean   // true si tous les nœuds n'ont pas pu être placés
}

/**
 * Kahn's algorithm — détecte aussi les cycles (cycle=true si order.length < nodes.length).
 *
 * Les dépendances pointant vers un nœud absent sont ignorées (comme dans le router).
 */
export function topologicalSort(nodes: DagNode[]): TopoResult {
  const inDegree: Record<string, number>   = {}
  const adj:      Record<string, string[]> = {}
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = [] }
  for (const n of nodes) {
    for (const dep of n.dependances) {
      if (adj[dep]) { adj[dep].push(n.id); inDegree[n.id]++ }
    }
  }
  const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj[id]) {
      if (--inDegree[next] === 0) queue.push(next)
    }
  }
  return { order, cycle: order.length < nodes.length }
}

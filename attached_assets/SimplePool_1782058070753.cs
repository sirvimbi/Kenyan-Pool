// ============= SimplePool.cs =============
// NEW FILE - Add to your project
using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Simple pooling for Unity - Optimized for pool game
/// </summary>
public static class SimplePool
{
    const int DEFAULT_POOL_SIZE = 5;

    class Pool
    {
        int nextId = 1;
        Stack<GameObject> inactive;
        GameObject prefab;
        Transform parentTransform;

        public Pool(GameObject prefab, int initialQty, Transform parent = null)
        {
            this.prefab = prefab;
            inactive = new Stack<GameObject>(initialQty);
            
            if (parent == null)
            {
                parentTransform = new GameObject(prefab.name + "_Pool").transform;
            }
            else
            {
                parentTransform = parent;
            }
        }

        public GameObject Spawn(Vector3 pos, Quaternion rot)
        {
            GameObject obj;
            
            if (inactive.Count == 0)
            {
                obj = (GameObject)GameObject.Instantiate(prefab, pos, rot);
                obj.name = prefab.name + " (" + (nextId++) + ")";
                obj.transform.parent = parentTransform;
                obj.AddComponent<PoolMember>().myPool = this;
            }
            else
            {
                obj = inactive.Pop();
                if (obj == null)
                {
                    return Spawn(pos, rot);
                }
                obj.transform.parent = parentTransform;
            }

            obj.transform.position = pos;
            obj.transform.rotation = rot;
            obj.SetActive(true);
            return obj;
        }

        public void Despawn(GameObject obj)
        {
            obj.SetActive(false);
            obj.transform.parent = parentTransform;
            inactive.Push(obj);
        }
        
        public void DespawnAll()
        {
            GameObject[] allObjects = new GameObject[inactive.Count];
            inactive.CopyTo(allObjects, 0);
            foreach (GameObject obj in allObjects)
            {
                if (obj != null)
                {
                    GameObject.Destroy(obj);
                }
            }
            inactive.Clear();
        }
    }

    class PoolMember : MonoBehaviour
    {
        public Pool myPool;
    }

    static Dictionary<GameObject, Pool> pools;
    static Transform defaultParent;

    static void Init(GameObject prefab = null, int qty = DEFAULT_POOL_SIZE, Transform parent = null)
    {
        if (pools == null)
        {
            pools = new Dictionary<GameObject, Pool>();
            if (defaultParent == null)
            {
                GameObject poolParent = new GameObject("ObjectPools");
                defaultParent = poolParent.transform;
            }
        }
        
        if (prefab != null && pools.ContainsKey(prefab) == false)
        {
            pools[prefab] = new Pool(prefab, qty, parent ?? defaultParent);
        }
    }

    static public void Preload(GameObject prefab, int qty = 1, Transform parent = null)
    {
        Init(prefab, qty, parent);
        GameObject[] obs = new GameObject[qty];
        for (int i = 0; i < qty; i++)
        {
            obs[i] = Spawn(prefab, Vector3.zero, Quaternion.identity);
        }
        for (int i = 0; i < qty; i++)
        {
            Despawn(obs[i]);
        }
    }

    static public GameObject Spawn(GameObject prefab, Vector3 pos, Quaternion rot)
    {
        Init(prefab);
        return pools[prefab].Spawn(pos, rot);
    }

    static public void Despawn(GameObject obj)
    {
        if (obj == null) return;
        
        PoolMember pm = obj.GetComponent<PoolMember>();
        if (pm == null)
        {
            Debug.Log("Object '" + obj.name + "' wasn't spawned from a pool. Destroying it instead.");
            GameObject.Destroy(obj);
        }
        else
        {
            pm.myPool.Despawn(obj);
        }
    }
    
    static public void DespawnAll(GameObject prefab)
    {
        if (pools != null && pools.ContainsKey(prefab))
        {
            pools[prefab].DespawnAll();
        }
    }
}
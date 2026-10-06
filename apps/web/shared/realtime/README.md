# Private live invalidation

usePrivateChannel accepts a current server-returned school room topic and a refetch callback. It subscribes private:true with the verified in-memory access token, receives only invalidation and rechecks current membership before API reconciliation. Token/school/offline changes unsubscribe; browser publish and presence are absent. Source 11/39/80/81 apply. Realtime permission caching cannot grant content access because all content is reloaded through current API authorization. No protected content is stored offline.

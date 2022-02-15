# Firestore graph hooks

Firebase client-side-join library like Graph QL

```tsx
export const App = () => {
  const [projects, loading, error] = useQuery(getProjects(), (project) => ({
    ownerRef: {
      nowPlayingRef: {},
    },
    kanbans: field(getKanbans(project.ref), (kanban) => ({
      todoLists: field(getTodoLists(kanban.ref), {}),
    })),
  }));

  return (
    <div>
        {projects.map(project => (
            <div key={project.id}>
                <p>{project.data.owner.data?.name}</p>
                <p>{project.data.owner.data?.nowPlaying.data?.title}</p>
                <p>{project.data.kanbans.length}</p>
            </div>
        ))}
    </div>
  );
};
```

## TODO

- fix bug
  - should loading variable turn to true when onSnapshot
- add tests
- refactor
  - distinguish GraphQuery and GraphQueryFactory
- nested document data
- better error handling
- typing internal code
- more strict types
- snapshot option
- fragment query
- flat query result structure mode
- no restriction reference field name mode
- documentation
- add guaranteed to exist option to ref field like extension field
- performance
  - keep unchanged field

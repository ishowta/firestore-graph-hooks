# Firestore graph hooks

Firebase client-side-join library like Graph Query

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
        {projects.data.map(project => (
            <div key={project.id}>
                <p>{projects[0].owner.name}</p>
                <p>{projects[0].owner.nowPlaying.title}</p>
                <p>{projects[0].kanbans.length}</p>
            </div>
        ))}
    </div>
  );
};
```

## TODO

- root query
- nested document data
- better error handling
- typing internal code
- more strict types
- snapshot option
- fragment query
- flat query result structure mode
- no restriction reference field name mode
- refactor
- documentation

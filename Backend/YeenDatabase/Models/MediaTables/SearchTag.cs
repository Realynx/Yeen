using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.NewFolder {
    public class SearchTag {
        [Key]
        public Guid Id { get; set; }

        public string Tag { get; set; }
        public ICollection<MediaCollection> MediaCollections { get; set; }
        public ICollection<Audio> Audio { get; set; }
        public ICollection<Season> Shows { get; set; }
        public ICollection<Movie> Movies { get; set; }
        public ICollection<CastActor> Actors { get; set; }
    }
}

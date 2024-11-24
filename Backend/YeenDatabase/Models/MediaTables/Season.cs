using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.MediaTables {
    public class Season {
        [Key]
        public Guid Id { get; set; }

        public string SeasonName { get; set; }
        public ICollection<Episode> Episodes { get; set; }
        public ICollection<Movie> Movies { get; set; }
        public ICollection<SearchTag> TagCloud { get; set; }
    }
}

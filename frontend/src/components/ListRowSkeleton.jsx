import PropTypes from "prop-types";
import Skeleton from "@mui/material/Skeleton";

export default function ListRowSkeleton({ count }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Skeleton
          key={i}
          variant="rounded"
          height={72}
          sx={{ borderRadius: ({ borders }) => borders.borderRadius.xl, mb: 1.5 }}
        />
      ))}
    </>
  );
}

ListRowSkeleton.defaultProps = {
  count: 3,
};

ListRowSkeleton.propTypes = {
  count: PropTypes.number,
};

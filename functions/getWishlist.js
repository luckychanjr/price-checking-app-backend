import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async () => {
  const data = await dynamo.send(
    new ScanCommand({
      TableName: "Wishlist"
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify(data.Items)
  };
};